# Kleine Siedler (Browser-Nachbau im Stil von "Die Siedler", 1993)

## Ziel
Spielmechanik und Spielgefühl so nah wie möglich am Original. Keine Originalassets, -namen, -sounds oder -logos. Alles wird selbst erzeugt.

## Stack
TypeScript (strict), Vite, HTML5 Canvas 2D, Vitest. Keine Spiel-Engine, möglichst keine Runtime-Abhängigkeiten.

## Struktur
- src/sim: reine Simulation, kein DOM, deterministisch
- src/render: Canvas-Rendering, Sprite-Generator
- src/ui: Menüs, Eingabe
- src/data: balance.ts, buildings.ts
- src/ai: Gegner-KI

## Harte Regeln
1. **Determinismus:** Gleicher Seed + gleiche Eingaben = gleiches Ergebnis. Kein Math.random(), kein Date.now() in src/sim. Nur der seedbare RNG.
2. **Sim und Rendering getrennt:** src/sim importiert nie aus render oder ui.
3. **Balance zentral:** Alle Spielwerte (Dauer, Kosten, Kapazitäten, Radien) stehen in src/data/balance.ts, nie hartkodiert.
4. **Waren gehen nie verloren:** Invarianten-Test (Warenzahl in der Welt = Lager + Flaggen + Träger + Gebäudepuffer) muss immer grün sein.
5. **Serialisierbar:** Der Weltzustand ist komplett JSON-serialisierbar. Keine Funktionen oder Klasseninstanzen mit versteckten Referenzen im State, Verweise nur über IDs.
6. **Testpflicht:** Jede Phase endet mit grünen Tests (`npm test`), laufendem Spiel (`npm run dev`) und Commit. Neue Logik in src/sim bekommt Unit-Tests.
7. **UI-Texte** nur über die i18n-Datei, Sprache Deutsch.

## Arbeitsweise
- Vor jeder Session: PLAN.md und STATUS.md lesen.
- Nach jeder Phase: STATUS.md aktualisieren (erledigt, offen, bekannte Bugs, getroffene Annahmen).
- Annahmen bei Unklarheiten in PLAN.md dokumentieren, nur bei echten Grundsatzentscheidungen nachfragen.
- Kleine, thematisch saubere Commits. Kein Refactoring über Phasengrenzen hinweg ohne Absprache.
- Performance-Ziel: 60 FPS bei 256x256-Karte, ~500 Siedlern, ~1000 Waren. Nur den sichtbaren Ausschnitt zeichnen, Terrain gecached, Pfadsuche pro Tick gedeckelt.

## Befehle
- `npm run dev`: Spiel starten
- `npm test`: Vitest
- `npm run lint`: ESLint + Prettier
- Debug-Overlay im Spiel: F3
