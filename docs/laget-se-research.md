# laget.se Integration Research

## Findings
- laget.se har INGET öppet/publikt API
- De erbjuder webcal/iCal-export av kalender (matcher, träningar)
- iCal innehåller aktiviteter men INTE anmälningsdata (vilka spelare som anmält sig)
- Anmälningsdata (vilka spelare som är anmälda) hanteras internt i deras system
- Man kan exportera medlemslistor till Excel (Silver/Guld-paket)
- Spelare anmäler sig via laget.se-appen eller webben

## Möjliga approaches
1. **Web scraping** - Logga in på laget.se och scrapa anmälningsdata. Kräver inloggning, fragilt, kan bryta mot ToS.
2. **iCal-kalender** - Kan hämta matcher/aktiviteter men inte anmälda spelare.
3. **Manuell CSV-import** - Användaren exporterar medlemslista från laget.se och importerar i appen.
4. **Proxy/backend** - Kräver backend-server för att logga in och hämta data.

## Conclusion
Inget öppet API. Bästa alternativet för en statisk frontend-app är manuell import/export.
