# Inventering av bilder och ljud

## Bekräftat lokala resurser

Följande original finns i Git och levereras av appen:

- vita lagets logotyp
- gröna lagets logotyp
- hockeybakgrunden
- favicon, Apple-ikon och samtliga PWA-ikoner

Kontrollera dem med:

```bash
pnpm assets:audit
```

Kommandot misslyckas om en obligatorisk fil saknas eller om kärnkonfigurationen
åter börjar peka på de gamla externa bildservrarna.

## Original som inte finns i Git-historiken

Följande filer förekom endast som externa URL:er och har aldrig checkats in:

| Resurs | Tidigare filnamn |
|---|---|
| Polar sponsorlogotyp | `Polar_ec4fb3a1.png` |
| Lindströms Transport sponsorlogotyp | `lindstromstransport_97331e95.png` |
| Kirunabilfrakt sponsorlogotyp | `Kirunabilfrakt_0aecf52d.png` |
| Ren sponsorlogotyp | `Ren_5427bd7a.jpg` |
| Slutsignal | `slutsignal_38c70fd2.mp3` |
| Vita lagets målljud | `MålVita_c23702e7.mp3` |
| Gröna lagets målljud | `MålGröna_940f09ff.mp3` |

Sponsorernas namn visas tills originalbilderna kan läggas tillbaka. Ljuden har
en lokal Web Audio-reservsignal. För att återställa exakt grafik och exakt ljud
behövs originalfilerna; de går inte att återskapa korrekt ur URL:erna eller den
nuvarande Git-historiken.

Lägg framtida sponsororiginal under `client/public/images/sponsors/` och ljud
under `client/public/audio/`. Använd inte externa temporära CDN-adresser.
