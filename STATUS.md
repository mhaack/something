# STATUS

## Aktuelle Phase: 1 abgeschlossen

### Erledigt (Phase 1)
- Projekt-Setup: TypeScript strict, Vite, Vitest, ESLint (mit Sperren für `Math.random`,
  `Date.now` und render/ui-Importe in `src/sim`), Prettier.
- Seedbarer RNG (sfc32, Zustand im Weltzustand), ganzzahlig gehashtes Value-Noise/fBm.
- Versetztes Dreiecksgitter mit 6 Nachbarn, 2 Dreiecke pro Knoten, Distanzen, Radien.
- Kartengenerierung per Seed: Höhen mit Randabfall, Wasser, Sumpf, Wiesen (3 Varianten), Wüste,
  Berge, Hochgebirge; Wälder und Einzelbäume, Felscluster, unsichtbare Bodenschätze (Kohle, Eisen,
  Gold, Granit) in Bergen; Kartengrößen 64/128/256.
- Startpositionen für 1–4 Spieler mit maximalem Abstand, freigeräumtem und geebnetem HQ-Bereich und
  Fairness-Ausgleich (Mindestzahl Bäume/Felsen im Umkreis).
- Weltzustand JSON-serialisierbar, Befehlsschnittstelle (noch ohne echte Befehle).
- Terrain-Rendering: eigener Rasterizer, Gouraud-Licht aus Höhen, Dithering, prozedurale Texturen,
  Chunk-Cache mit LRU und Rasterbudget pro Frame.
- Prozedurale Sprites: Laub-/Nadelbäume, Felsen in 3 Größen, Startfahnen in Spielerfarbe.
- Kamera: Scrollen (Ziehen, Pfeiltasten/WASD), 3 Zoomstufen (ganzzahlige Skalierung), Knoten-Picking
  mit Höhen, Minikarte mit Sprung per Klick.
- Spielschleife mit fester Tickrate (20/s), Tempo 1x–8x, Pause, Interpolationsanteil.
- Debug-Overlay (F3): FPS, Frame-/Tick-Zeit, Chunks, Objekte, Kamera, Knoteninfos.
- Tests: RNG, Geometrie, Kartengenerierung (Determinismus, Fairness, Größen), Serialisierung, Uhr,
  Picking, Rasterlücken (26 Tests).

### Gemessen
- 256×256-Karte, 4 Spieler, Chromium headless 1280×720: 60 FPS, ~0,3–0,7 ms Renderzeit pro Frame.

### Offen / nächste Schritte (Phase 2)
- Flaggen, Straßen, HQ als Lager, Träger, Warentransport, Routing mit Stau-Kosten, Esel.
- Replay-Test (Determinismus mit Befehlen), Invarianten-Test für Waren.

### Bekannte Punkte
- Wasser ist noch nicht animiert (geplant für Phase 8, Politur).
- Terrainübergänge sind harte Dreieckskanten (Annahme A6).
- Startfahne ist Platzhalter für das HQ (kommt in Phase 2).
- Kein Hauptmenü, Seed/Größe/Spieler per URL (Annahme A5).

### Annahmen
Siehe PLAN.md, Abschnitt 5 (A1–A7).
