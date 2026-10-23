# Kleine Siedler

Browser-Aufbau- und Wirtschaftsspiel nach dem Vorbild des Klassikers von 1993. TypeScript, Vite,
Canvas 2D, ohne Spiel-Engine und ohne Runtime-Abhängigkeiten. Alle Grafiken werden prozedural im
Code erzeugt, es gibt keine externen Assets.

## Start

```bash
npm install
npm run dev      # Spiel unter http://localhost:5173
npm test         # Unit-Tests (Vitest)
npm run lint     # ESLint + Prettier
npm run build    # Produktions-Build nach dist/
```

URL-Parameter (bis zum Hauptmenü in Phase 8): `?seed=42&size=128&players=2`
(Größe 64/128/256, Spieler 1–4).

## Steuerung

Unten liegt die Werkzeugleiste (Auswählen, Flagge, Straße, Abreißen, Bauhilfe, Stau-Anzeige,
Minikarte, Hilfe, Debug), oben links die Temposteuerung. `F1` öffnet die vollständige
Tastenübersicht im Spiel.

| Aktion | Eingabe |
| --- | --- |
| Aktionen am Knoten | Linksklick (Kontextmenü) bzw. aktives Werkzeug anwenden |
| Werkzeug wählen | `1` Auswählen · `2` Flagge · `3` Straße · `4` Abreißen |
| Direkt unter dem Mauszeiger | `F` Flagge · `R` Straße ab Flagge · `Entf` Abriss · `G` Testware |
| Straßenbau | Knoten anklicken verlängert; Klick auf Flagge oder zweimal aufs Ende beendet; Rechtsklick/Rücktaste: Schritt zurück; Esc: abbrechen |
| Bauhilfe / Stau-Anzeige | `H` / `V` |
| Karte scrollen | Ziehen, Pfeiltasten/WASD oder Maus an den Bildrand |
| Zoom (4 Stufen) | Mausrad, Bild↑/Bild↓ |
| Minikarte | Klicken/Ziehen springt zur Position, `M` blendet ein/aus |
| Pause / Tempo 1x–8x | Leertaste / `+` `−` |
| Hilfe / Debug | `F1` / `F3` |
| Neue Zufallskarte | `N` |

## Architektur

- `src/sim` – reine, deterministische Simulation ohne DOM. Seedbarer RNG, Kartengenerierung,
  JSON-serialisierbarer Weltzustand, Befehle für Replays.
- `src/render` – Canvas-Rendering: Terrain wird mit einem eigenen Dreiecks-Rasterizer in Chunks
  vorgerendert und gecacht, Objekte werden als prozedurale Sprites gezeichnet, nur der sichtbare
  Ausschnitt. Niedrige Basisauflösung, ganzzahlig hochskaliert.
- `src/ui` – Spielschleife (feste Tickrate, entkoppeltes Rendering), Eingabe, HUD, Debug-Overlay,
  deutsche Texte in `i18n.ts`.
- `src/data` – alle Spielwerte (`balance.ts`) und Terrain-Definitionen.
- `src/ai` – Gegner-KI (ab Phase 7).

Details und Phasenplan stehen in [PLAN.md](PLAN.md), der aktuelle Stand in [STATUS.md](STATUS.md).
