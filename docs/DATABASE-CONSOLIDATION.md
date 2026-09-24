# Gemensam databas

Alla delar av `app.stalstadens.se` använder redan samma server och samma
`DATABASE_URL`. Det finns inte längre separata anslutningar i runtime-koden:

| Del | Tabeller i den gemensamma databasen |
|---|---|
| Lineup | `lineup_state`, `lineup_operations`, `saved_lineups` |
| Score Tracker, historik och statistik | `match_results`, `app_config` |
| Gemensamt | `users`, `app_secrets` |

Schemat definieras i `drizzle/schema.ts`, skapas av migreringarna i `drizzle/`
och nås genom den enda anslutningen i `server/db.ts`. Lineup använder
`server/lineupDb.ts` och Score Tracker använder `server/scoreDb.ts`, men båda
hämtar samma Drizzle-instans från `getDb()`.

## Kontrollera produktionsdatabasen

Kör först en skrivskyddad inventering. Kommandot kontrollerar att alla sju
tabeller finns i databasen och visar antal rader i varje tabell.

```bash
DATABASE_URL="mysql://..." pnpm db:audit
```

Om tabeller saknas, kör migreringarna mot måldatabasen och kontrollera igen:

```bash
DATABASE_URL="mysql://..." pnpm db:push
DATABASE_URL="mysql://..." pnpm db:audit
```

## Tidigare databaser

Importen från de äldre systemen är avslutad. Projektet innehåller därför inga
importskript eller runtime-anslutningar till dem. Coolify ska bara ha den
gemensamma `DATABASE_URL`. Kör `pnpm db:audit` efter migreringar och releaser för
att kontrollera att det gemensamma schemat fortfarande är komplett.
