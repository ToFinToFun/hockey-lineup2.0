# Drag-and-Drop Bug Fix Notes

## Fix Applied
Replaced `pendingSavesRef` counter with `dirtyRef` flag approach:
- `dirtyRef` is set to `true` IMMEDIATELY when any local state change happens (in the save useEffect)
- SSE events are blocked whenever `dirtyRef.current === true`
- `dirtyRef` is only cleared after a successful save completes AND no queued saves remain
- Saves are serialized: only one mutation in-flight at a time via `saveInFlightRef`
- If new changes arrive during a save, they're queued via `saveQueuedRef`

## Key Difference from Previous Approach
- OLD: `pendingSavesRef` only blocked SSE after the 300ms debounce timer fired (when mutation started)
- NEW: `dirtyRef` blocks SSE immediately when state changes, covering the entire debounce window

## Test Results
- All 32 existing tests pass
- TypeScript compiles with 0 errors
- Dev server running and app loads correctly
