// Firebase Realtime Database integration for Stålstadens Lineup
// All state changes are synced in real-time to all connected users

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  off,
  push,
  remove,
  type DatabaseReference,
} from "firebase/database";
import type { Player } from "./players";

const firebaseConfig = {
  apiKey: "AIzaSyA7k77rXOhZg2uZv6bFuHlkSAdrmXrHllo",
  authDomain: "stalstadens-lineup.firebaseapp.com",
  databaseURL:
    "https://stalstadens-lineup-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "stalstadens-lineup",
  storageBucket: "stalstadens-lineup.firebasestorage.app",
  messagingSenderId: "86792911711",
  appId: "1:86792911711:web:e5c161934203e3050c14ea",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export type AppState = {
  players: Player[];
  lineup: Record<string, Player>;
  teamAName: string;
  teamBName: string;
  deletedPlayerIds?: string[]; // IDs för medvetet borttagna spelare
  teamAConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
  teamBConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
};

export type SavedLineup = {
  id: string;          // Firebase push-key
  name: string;        // Användarens namn, t.ex. "Hemmaplan 5-3-2"
  savedAt: number;     // Unix timestamp (ms)
  teamAName: string;
  teamBName: string;
  lineup: Record<string, Player>;
};

// Write the full app state to Firebase
export function saveStateToFirebase(state: AppState): void {
  const stateRef = ref(db, "lineup");
  set(stateRef, state).catch((err) => {
    console.error("Firebase write error:", err);
  });
}

// Subscribe to real-time updates from Firebase
export function subscribeToFirebase(
  callback: (state: AppState | null) => void
): () => void {
  const stateRef: DatabaseReference = ref(db, "lineup");

  onValue(
    stateRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as AppState);
      } else {
        callback(null); // No data yet — use defaults
      }
    },
    (error) => {
      console.error("Firebase read error:", error);
      callback(null);
    }
  );

  // Return unsubscribe function
  return () => off(stateRef);
}

// ─── Sparade uppställningar ───────────────────────────────────────────────────

// Spara en ny uppställning under /savedLineups/{pushKey}
export async function saveLineupToFirebase(
  name: string,
  teamAName: string,
  teamBName: string,
  lineup: Record<string, Player>
): Promise<string> {
  const listRef = ref(db, "savedLineups");
  const newRef = await push(listRef, {
    name,
    savedAt: Date.now(),
    teamAName,
    teamBName,
    lineup,
  });
  return newRef.key!;
}

// Hämta alla sparade uppställningar (engångshämtning)
export async function fetchSavedLineups(): Promise<SavedLineup[]> {
  const listRef = ref(db, "savedLineups");
  const snapshot = await get(listRef);
  if (!snapshot.exists()) return [];
  const raw = snapshot.val() as Record<string, Omit<SavedLineup, "id">>;
  return Object.entries(raw)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.savedAt - a.savedAt); // nyaste först
}

// Prenumerera på sparade uppställningar i realtid
export function subscribeSavedLineups(
  callback: (lineups: SavedLineup[]) => void
): () => void {
  const listRef: DatabaseReference = ref(db, "savedLineups");
  onValue(listRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const raw = snapshot.val() as Record<string, Omit<SavedLineup, "id">>;
    const list = Object.entries(raw)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.savedAt - a.savedAt);
    callback(list);
  });
  return () => off(listRef);
}

// Ta bort en sparad uppställning
export async function deleteLineupFromFirebase(id: string): Promise<void> {
  const itemRef = ref(db, `savedLineups/${id}`);
  await remove(itemRef);
}
