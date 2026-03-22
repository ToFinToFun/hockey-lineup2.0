/**
 * useSavedLineups — Replaces Firebase saved lineups with tRPC + SSE.
 *
 * Provides:
 * - List of saved lineups from SQL
 * - Real-time updates via SSE when lineups are added/deleted/favorited
 * - CRUD operations via tRPC mutations
 */

import { useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export interface SavedLineupData {
  id: number;
  shareId: string;
  name: string;
  teamAName: string;
  teamBName: string;
  lineup: Record<string, any>;
  favorite: boolean;
  savedAt: number;
}

export function useSavedLineups() {
  const utils = trpc.useUtils();

  // Fetch all saved lineups
  const { data: savedLineups = [], isLoading } = trpc.savedLineups.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Mutations
  const createMutation = trpc.savedLineups.create.useMutation({
    onSuccess: () => {
      utils.savedLineups.list.invalidate();
    },
  });

  const deleteMutation = trpc.savedLineups.delete.useMutation({
    onSuccess: () => {
      utils.savedLineups.list.invalidate();
    },
  });

  const toggleFavoriteMutation = trpc.savedLineups.toggleFavorite.useMutation({
    onSuccess: () => {
      utils.savedLineups.list.invalidate();
    },
  });

  // Listen for SSE savedLineupsChange events to refresh the list
  useEffect(() => {
    const es = new EventSource("/api/sse/lineup");

    es.addEventListener("savedLineupsChange", () => {
      // Refresh the list when any saved lineup changes
      utils.savedLineups.list.invalidate();
    });

    es.onerror = () => {
      es.close();
      // Reconnect handled by the main SSE connection in useLineupSync
    };

    return () => es.close();
  }, [utils]);

  const saveLineup = useCallback(
    async (data: {
      name: string;
      teamAName: string;
      teamBName: string;
      lineup: Record<string, any>;
    }): Promise<string> => {
      const result = await createMutation.mutateAsync(data);
      return result.shareId;
    },
    [createMutation]
  );

  const deleteLineup = useCallback(
    async (id: number) => {
      await deleteMutation.mutateAsync({ id });
    },
    [deleteMutation]
  );

  const toggleFavorite = useCallback(
    async (id: number) => {
      await toggleFavoriteMutation.mutateAsync({ id });
    },
    [toggleFavoriteMutation]
  );

  return {
    savedLineups: savedLineups as SavedLineupData[],
    isLoading,
    saveLineup,
    deleteLineup,
    toggleFavorite,
    isSaving: createMutation.isPending,
  };
}
