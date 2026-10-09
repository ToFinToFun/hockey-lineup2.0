# Senare – idéer och saker att komma ihåg

Samlat 2026-10-09 (v2.70.0). Inget här är påbörjat eller beslutat i detalj – ta upp en punkt i taget när det är dags.

## Funktioner (förslag)
- **Kul statistik som utmärkelser** – t.ex. "Öppnaren" (flest första mål), "Sist ut" (flest sena mål), ev. längsta måltorka. Visas då i Utmärkelser och kan användas i Media-mallen Utmärkelse.
- **Flera bilder i samma video** – t.ex. en bild först och en efter klippet (idag en bild per video, valbar plats).
- **Offentlig statistik** – en publik del (eller export/begränsade länkar) när det finns riktig data. Statistiken är styrelsen + modullänkar tills vidare.
- **Automatisk synk från medlemsregistret (laget.se)** – förberett med laget-namn och externt ID i spelarregistret.
- **Utskriftsark för hockeykort** – A4, nio kort 63×88 mm med skärmärken. Skippat tills vidare.

## Stålbladet (Media i tidningsstil) – fortsättning
- v2.72.0: löpsedel och artikel. v2.73.0: förstasida, artikel och intervju med fri text, puffar, resultatrutor och annonser (annonstext per sponsor).
- v2.74.0: enhetlig blå stil, sida 2, inklistring och SHL via Highlightly (nyckel under Inställningar → Externa källor).
- SHL-data kan återanvändas på fler ställen (startsidan, Live, Resultatbörsen).
- Nästa: krönika, spelarbetyg (1–5 puckar per spelare), "Veckans profil".
- Sponsorer som tidningsannonser i fler former (helsidesannons, annonsruta i resultatsidan).

## Väntar på något
- **Målljud och slutsignal i Score Tracker** – pausat, ljudfilerna saknas (målljud Vita, målljud Gröna, slutsignal → `client/public/audio/`). Se docs/ASSET-INVENTORY.md.
- **PIR: "Ta fram förslag"** – köras löpande under säsongen när det finns matcher (försiktiga förslag från 6 matcher).
- **laget.se-kontot** – byta från Jerrys eget konto till ett gemensamt styrelsekonto (miljövariabler i Coolify).

## Att prova på riktigt
- Notismejl efter uppdateringen till nodemailer 10 (v2.69.3) – skicka en testnotis.
- Första riktiga videon med bild från Media (placering, utan titelkort, 9:16 och 4:5).

## För andra föreningar / längre fram
- **Gränssnittets färger efter klubbens profil** – idag ca 316 hårdkodade gröna ställen.
- **Installationsmall per förening** – se docs/INSTALLATION.md (finns som guide; mall för Coolify kvar).

## Underhåll
- **Större beroendeuppdateringar** – TypeScript 7, framer-motion 13 och lucide-react 1.x. Tas i en designgenomgång (kräver UI-genomgång).
- **Kontrollbilderna (test/golden)** ger andra fingeravtryck i Claudes miljö än i CI – jämför före/efter lokalt; CI (Ubuntu 24.04) är facit.
