# Header Structure Analysis

## Current layout (lines 1437-1707):
Outer: `<header>` → `glass-header px-3 py-2` → `flex flex-wrap items-center gap-x-3 gap-y-1.5`

### Row 1 (left): Logo + Title + Event info (shrink-0)
- Logo image 28x28
- "STÅLSTADENS SF" title
- Event info text

### Row 2 (center, wraps to full row on mobile): Toolbar buttons
`flex items-center gap-1.5 flex-1 justify-center flex-wrap order-last sm:order-none w-full sm:w-auto`

Contains ALL these elements:
1. Home icon
2. Undo icon
3. SSE sync icon
4. Divider
5. SIDOLÄGE pill button (with text)
6. AUTO pill button (with text)
7. SLUMPA pill button (with text)
8. Match time input (60 min)
9. DELA pill button (with text)
10. Divider
11. Stats dropdown icon
12. Theme toggle icon
13. Export/download icon

### Row 3 (right): Demo + Settings
`flex items-center gap-0.5 shrink-0 ml-auto sm:ml-0`
- Demo (flask) icon + count input
- Settings (gear) icon

## Problem on mobile:
- The toolbar wraps to 2-3 rows because all buttons are in one flex-wrap container
- Total header height: ~100-120px on mobile (too tall!)

## Proposed compact mobile layout:
Row 1: [Logo] [Title] [Home] [Undo] [Wifi] | [Auto] [Slumpa] | [Demo] [Settings]
- Remove text from buttons on mobile, keep only icons
- Move SIDOLÄGE, DELA, Stats, Theme, Export into a "..." overflow menu
- Keep match time as small input
