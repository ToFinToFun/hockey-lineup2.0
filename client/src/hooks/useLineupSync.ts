/**
 * useLineupSync — Replaces Firebase real-time sync with tRPC + SSE.
 *
 * Provides:
 * - Initial state load from SQL via tRPC
 * - Real-time updates via SSE (Server-Sent Events)
 * - Debounced save to SQL on local state changes
 * - Toast notifications for remote changes
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";

export interface LineupSyncState {
  players: any[];
  lineup: Record<string, any>;
  teamAName: string;
  teamBName: string;
  teamAConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
  teamBConfig?: { goalkeepers: number; defensePairs: number; forwardLines: number };
  deletedPlayerIds?: string[];
}

export interface RemoteChange {
  description: string;
  timestamp: number;
}

interface UseLineupSyncOptions {
  /** Called when remote state is received (initial load or SSE update) */
  onRemoteState: (state: LineupSyncState) => void;
  /** Called when a remote change notification should be shown */
  onRemoteChange?: (change: RemoteChange) => void;
}

export function useLineupSync({ onRemoteState, onRemoteChange }: UseLineupSyncOptions) {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const isReceivingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasLoadedInitial = useRef(false);

  // tRPC mutations
  const saveStateMutation = trpc.lineup.saveState.useMutation();

  // Load initial state
  const { data: initialState, isLoading } = trpc.lineup.getState.useQuery(undefined, {
    enabled: !hasLoadedInitial.current,
    refetchOnWindowFocus: false,
  });

  // Process initial state from tRPC query
  useEffect(() => {
    if (initialState && !hasLoadedInitial.current) {
      hasLoadedInitial.current = true;
      isReceivingRef.current = true;
      versionRef.current = initialState.version;
      setVersion(initialState.version);
      onRemoteState({
        players: initialState.players as any[],
        lineup: initialState.lineup as Record<string, any>,
        teamAName: initialState.teamAName,
        teamBName: initialState.teamBName,
        teamAConfig: initialState.teamAConfig ?? undefined,
        teamBConfig: initialState.teamBConfig ?? undefined,
        deletedPlayerIds: initialState.deletedPlayerIds ?? undefined,
      });
      setTimeout(() => {
        isReceivingRef.current = false;
      }, 100);
    }
  }, [initialState, onRemoteState]);

  // Connect to SSE
  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`/api/sse/lineup?lastSeq=${versionRef.current}`);
      eventSourceRef.current = es;

      es.addEventListener("connected", () => {
        setConnected(true);
      });

      es.addEventListener("stateChange", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.version <= versionRef.current) return; // Already have this version

          versionRef.current = data.version;
          setVersion(data.version);

          if (data.state) {
            isReceivingRef.current = true;
            onRemoteState({
              players: data.state.players,
              lineup: data.state.lineup,
              teamAName: data.state.teamAName,
              teamBName: data.state.teamBName,
              teamAConfig: data.state.teamAConfig ?? undefined,
              teamBConfig: data.state.teamBConfig ?? undefined,
              deletedPlayerIds: data.state.deletedPlayerIds ?? undefined,
            });
            setTimeout(() => {
              isReceivingRef.current = false;
            }, 100);
          }

          // Show toast for remote changes
          if (data.description && onRemoteChange) {
            onRemoteChange({
              description: data.description,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error("[SSE] Failed to parse stateChange:", err);
        }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      eventSourceRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Save state to SQL with debouncing and operation logging.
   * Call this whenever local state changes.
   */
  const saveState = useCallback(
    (
      state: LineupSyncState,
      operation?: { opType: string; description: string; payload?: Record<string, any> }
    ) => {
      if (isReceivingRef.current) return;

      // Debounce: cancel previous pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveStateMutation.mutate(
          {
            players: state.players,
            lineup: state.lineup,
            teamAName: state.teamAName,
            teamBName: state.teamBName,
            teamAConfig: state.teamAConfig,
            teamBConfig: state.teamBConfig,
            deletedPlayerIds: state.deletedPlayerIds,
            operation,
          },
          {
            onSuccess: (result) => {
              versionRef.current = result.version;
              setVersion(result.version);
            },
            onError: (err) => {
              console.error("[LineupSync] Save failed:", err);
            },
          }
        );
      }, 300); // 300ms debounce
    },
    [saveStateMutation]
  );

  /**
   * Check if we're currently receiving a remote update (to prevent echo).
   */
  const isReceiving = useCallback(() => isReceivingRef.current, []);

  return {
    connected,
    version,
    isLoading,
    saveState,
    isReceiving,
    hasLoadedInitial: hasLoadedInitial.current,
  };
}
