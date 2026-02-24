// Firebase Realtime Database integration for Stålstadens Lineup
// All state changes are synced in real-time to all connected users

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  onValue,
  off,
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
