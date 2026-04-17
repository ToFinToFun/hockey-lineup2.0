# +/- Button Revert Bug — ROOT CAUSE FOUND

## The Problem
When clicking +/- to add/remove defense pairs, forward lines, or goalkeepers, the change appears briefly then reverts.

## Root Cause

The SSE echo prevention is NOT working reliably. Here's the exact sequence:

1. User clicks "+" → `setTeamAConfig(newConfig)` 
2. React re-renders
3. Save-effect fires (line 452), schedules 50ms debounced `saveToServer()`
4. 50ms later, `saveToServer()` sends the new state to the server
5. Server saves it, returns `{ version: N }`
6. `saveToServer()` updates `versionRef.current = N`
7. Server broadcasts SSE `stateChange` with `version: N` and `state: { ...newState }`
8. SSE handler checks: `data.version <= versionRef.current` → should be true (N <= N)
9. **BUT**: There's a race condition! Steps 6 and 7 can happen in any order.
   - If the SSE event arrives BEFORE the `saveToServer()` promise resolves (step 6),
     then `versionRef.current` is still the OLD version, and the SSE event is treated
     as a remote change → `applyRemoteState` is called with the state that INCLUDES
     the new config, which should be fine...

Wait, actually that should work. Let me re-examine.

## ACTUAL Root Cause: The SSE notifyStateChange broadcasts `stateData` which is the INPUT to saveState

Look at routers.ts line 89-94:
```ts
sseManager.notifyStateChange({
  version: result.version,
  opType: operation?.opType ?? "fullSync",
  description: operation?.description ?? "",
  state: stateData,  // <-- This is the input, which DOES include the new config
});
```

So the SSE broadcast includes the correct new config. If it arrives before the save resolves, `applyRemoteState` would set the config to the new value (correct). If it arrives after, it's ignored as an echo (correct).

## WAIT — I think I found it!

Look at the save-effect (line 452-472):
```ts
useEffect(() => {
    if (isSyncing.current) return;  // <-- THIS!
    ...
```

When the initial load happens:
1. `applyRemoteState` is called with the server state
2. `isSyncing.current = true`
3. `applyRemoteState` sets `teamAConfig` to the server's config (e.g., 1 defense pair)
4. 150ms later, `isSyncing.current = false`

Now the user clicks "+" immediately:
5. `setTeamAConfig({ defensePairs: 2 })` 
6. Save-effect fires, `isSyncing.current` is false, proceeds normally
7. Schedules 50ms save

But what if the user clicks "+" DURING the 150ms isSyncing window?
5. `setTeamAConfig({ defensePairs: 2 })`
6. Save-effect fires, `isSyncing.current` is TRUE → returns early!
7. The config change is NEVER saved to the server
8. Next SSE event from another client (or next page interaction) reverts it

Actually, this only explains the case during the first 150ms. The user reports it happens consistently.

## REAL ROOT CAUSE: Multiple rapid state updates

When the user clicks "+":
1. `setTeamAConfig(newConfig)` triggers save-effect
2. Save-effect schedules 50ms timer
3. `saveToServer()` fires after 50ms
4. Server saves, returns version N, broadcasts SSE
5. SSE arrives with version N and the CORRECT new state
6. But `versionRef.current` was already updated to N in step 4
7. So SSE is ignored (echo) — CORRECT

Hmm, this should work. Let me look at what happens when the SSE arrives BEFORE the save resolves...

Actually, I think the issue is that `saveToServer` uses refs but the SSE `applyRemoteState` uses `setState`. If two rapid saves happen:

1. User clicks "+" (defensePairs: 1 → 2)
2. Save-effect fires, schedules 50ms timer
3. Timer fires, `saveToServer()` sends state with defensePairs=2
4. Server returns version=N
5. SSE broadcasts version=N with defensePairs=2
6. Since versionRef=N, SSE is ignored — CORRECT

This should work! Unless... the SSE event from a PREVIOUS save arrives and overwrites.

## NEW THEORY: Stale state in the SSE broadcast

When `saveToServer()` is called, it reads from refs. But the SSE broadcast on the server side uses `stateData` which is the input to the mutation. The input comes from `saveToServer()` which reads `teamAConfigRef.current`.

If the ref is stale (hasn't been updated yet when saveToServer fires), the server would save the OLD config and broadcast it. Then the SSE echo would be ignored, but the server now has the OLD config. Next time the page loads, it gets the old config.

But we added the ref sync! `useEffect(() => { teamAConfigRef.current = teamAConfig; }, [teamAConfig])` runs BEFORE the save-effect's 50ms timer fires.

## FINAL THEORY: The problem is NOT the SSE echo but the INITIAL LOAD

When the page loads:
1. Initial state is fetched from server (with old config)
2. `applyRemoteState` is called → sets config to old value
3. User clicks "+" → config changes
4. Save-effect fires → saves new config to server
5. But then the page might re-fetch or another SSE event arrives

Actually, I should just add console.log debugging and test live. But since I can't do that, let me look for another pattern.

## FOUND IT: The `teamAConfig` and `teamBConfig` are optional in the saveState input!

In routers.ts line 65-73, they're `.optional()`. And in the save-effect, `saveToServer()` is called WITHOUT arguments, so it reads from refs. But what about the INITIAL save on line 389-396?

```ts
saveStateMutation.mutateAsync({
  players: localState.availablePlayers,
  lineup: sanitizedLocalLineup,
  teamAName: localState.teamAName,
  teamBName: localState.teamBName,
  // NO teamAConfig or teamBConfig!
})
```

This initial save doesn't include configs! So the server saves `undefined` for configs. Then when the SSE broadcasts this, `applyRemoteState` gets `state.teamAConfig = undefined`, and line 316 `if (state.teamAConfig) setTeamAConfig(state.teamAConfig)` — the `if` check prevents setting undefined. So this is fine.

## I think the actual issue is simpler than I thought

The `saveToServer` function is wrapped in `useCallback` with `[saveStateMutation]` as dependency. This means it captures `saveStateMutation` from the render. But `saveStateMutation` from tRPC might change on every render, causing `saveToServer` to be recreated, which causes the save-effect to re-fire...

Actually no, tRPC mutations are stable.

Let me just look at this from a different angle and add proper logging.
