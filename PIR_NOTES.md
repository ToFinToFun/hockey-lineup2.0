# PIR Data Model Notes

## Match Results Table (matchResults)
- id, name, teamWhiteScore, teamGreenScore
- goalHistory: JSON array of {team, scorer, assist, other, sponsor, timestamp}
- matchStartTime, matchEndTime, createdAt
- lineup: JSON { lineup: Record<slotId, Player>, availablePlayers, teamAName, teamBName, teamAConfig, teamBConfig }

## Slot ID format
- "team-a-gk-1" → goalkeeper team A
- "team-a-def-1-left" → defense pair 1 left, team A
- "team-a-fwd-1-lw" → forward line 1 left wing, team A
- "team-b-..." → same for team B

## Team mapping
- teamAName contains "vit" → team-a = white, team-b = green
- Otherwise team-a = green, team-b = white

## Player key format
- "Name #Number" or just "Name" if no number

## Existing playerStats already computes per-player:
- matchesPlayed, matchesWhite, matchesGreen
- wins, losses, draws
- goals, assists, gwg

## PIR Algorithm Plan
1. Fetch all matches
2. For each match, extract all players and which team they were on
3. Run iterative Elo-like rating:
   - Start all players at 1000
   - For each match, compute expected outcome based on team average ratings
   - Adjust individual ratings based on actual vs expected
   - Weight by team strength differential
4. Iterate 20 times until convergence
5. Return PIR scores per player key
