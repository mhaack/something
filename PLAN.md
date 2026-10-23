# PLAN – Kleine Siedler

Browser-Aufbau- und Wirtschaftsspiel nach dem Vorbild des Klassikers von 1993. Alle Grafiken,
Sounds und Namen werden selbst erzeugt. Siehe `CLAUDE.md` für die harten Regeln.

## 1. Architektur

```
src/
  sim/      reine Simulation (kein DOM, deterministisch, JSON-serialisierbarer Zustand)
    rng.ts        seedbarer RNG (sfc32-artig, Zustand = 4 Zahlen im Weltzustand)
    noise.ts      ganzzahlig gehashtes Value-Noise / fBm (keine Math.sin o. ä.)
    geometry.ts   Gitter: Index, 6 Nachbarn, Dreiecke, Distanzen
    map.ts        Kartentypen + Abfragen (begehbar, bebaubar, Steigung, Bauplatzgröße)
    mapgen.ts     prozedurale Kartengenerierung per Seed + Startpositionen
    world.ts      Weltzustand, Erzeugung, Tick, Befehle
    commands.ts   Spielereingaben als serialisierbare Befehle (Replay-fähig)
  render/   Canvas-Rendering
    camera.ts     Kamera, Projektion Welt↔Bildschirm, Knoten-Picking
    palette.ts    Farbpaletten
    terrainCache.ts  Terrain in Chunks vorgerendert (eigener Dreiecks-Rasterizer)
    sprites.ts    prozeduraler Sprite-Generator (Pixel-Arrays + Paletten → Canvas)
    renderer.ts   Zeichnet sichtbaren Ausschnitt: Terrain-Chunks, Objekte, Overlays
    minimap.ts    Minikarte
  ui/       Eingabe, Menüs, i18n, Debug-Overlay (DOM-Panels über dem Canvas)
  data/     balance.ts (alle Zahlenwerte), terrain.ts (Terraineigenschaften), buildings.ts
  ai/       Gegner-KI (Phase 7), nutzt nur die öffentlichen Befehle
  main.ts   Spielschleife: feste Tickrate, Rendering mit Interpolation
tests/      Vitest-Tests (nur gegen src/sim, src/data, src/ai und reine Render-Mathematik)
```

### Spielschleife

- Feste Simulationsrate `TICKS_PER_SECOND` (20). `requestAnimationFrame` akkumuliert Zeit, führt
  `speed × dt / tickDauer` Ticks aus (gedeckelt pro Frame), Rendering interpoliert mit `alpha`.
- Tempo 1x/2x/4x/8x und Pause ändern nur die Ticks pro Frame.
- Alle Spielereingaben werden als `Command` in eine Warteschlange gelegt und zu Beginn des nächsten
  Ticks angewendet. Replay = Seed + Liste von (Tick, Command).

### Zustand

- Ein `World`-Objekt aus reinen Daten (Zahlen, Strings, Arrays, Plain Objects). Entities in
  `Record<id, Entity>` bzw. Arrays mit stabilen numerischen IDs (`nextId`-Zähler im State).
- Kartendaten als `number[]` (nicht Typed Arrays), damit `JSON.stringify` verlustfrei ist.
- Abgeleitete Caches (z. B. Flaggen-Graph, Pfad-Caches) leben außerhalb des States und werden nach
  dem Laden neu aufgebaut.

## 2. Karte

- Versetztes Gitter wie im Original: Ungerade Zeilen sind um eine halbe Kachel nach rechts versetzt.
  Jeder Knoten hat 6 Nachbarn (O, W, NO, NW, SO, SW).
- Pro Knoten zwei Dreiecke: `UP` = (Knoten, SW, SO) mit Spitze oben und `DOWN` = (Knoten, O, SO)
  mit Spitze unten. Terrain wird pro Dreieck gespeichert (`terrain[2*i]`, `terrain[2*i+1]`).
- Höhe pro Knoten (0…`MAX_HEIGHT`). Bildschirmposition: `x*TW + (y&1)*TW/2`, `y*TH − h*HEIGHT_PX`.
- Terraintypen: Wasser, Sumpf, Wiese (3 Varianten), Wüste, Berg (abbaubar), Hochgebirge/Schnee
  (unbegehbar). Bäume und Felsen sind **Objekte** auf Knoten, keine Terraintypen.
- Knoten begehbar, wenn mindestens ein angrenzendes Dreieck begehbar ist. Bebaubar (Gebäude), wenn
  alle 6 angrenzenden Dreiecke bebaubar sind; Bergwerk, wenn alle 6 Berg sind.
- Rohstoffe (Kohle, Eisen, Gold, Granit) unsichtbar pro Bergknoten (Typ + Menge).

### Kartengenerierung

1. Höhe = fBm-Value-Noise + Insel-/Randabfall (Karte fällt am Rand ins Wasser ab).
2. Schwellwerte → Wasser (unter Wasserspiegel, Höhe geglättet), Berg, Hochgebirge.
3. Feuchte-Noise → Sumpf (feucht, niedrig) und Wüste (trocken) auf Wiesen.
4. Wald-Noise → Bäume auf Wiesen, Fels-Cluster → Felsen.
5. Rohstoff-Noise pro Typ auf Bergknoten.
6. Startpositionen: Kandidaten mit großer ebener Wiese im Radius, gierig mit maximalem
   Mindestabstand ausgewählt; danach Fairness-Ausgleich: Bäume/Felsen im Startradius werden auf
   identische Mindestzahlen aufgefüllt und der Startbereich wird freigeräumt.

## 3. Phasen

| Phase | Inhalt                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------ |
| 1     | Setup, Kartengenerierung, Terrain mit Höhen, Scrollen/Zoom, Minikarte, Debug-Overlay-Grundgerüst |
| 2     | Flaggen, Straßen (Regeln, Steigung), HQ-Lager, Träger, Warentransport, Routing mit Stau, Esel    |
| 3     | Baustellen, Bauarbeiter, Planierer, Bauplatzregeln, Holzfäller/Förster/Sägewerk/Steinbruch       |
| 4     | Nahrungsketten, Geologe, Bergwerke mit Nahrungsverbrauch                                         |
| 5     | Metallketten, Werkzeugschmiede + Prioritäten, Berufe durch Werkzeuge, Waffen, Münzen, Statistik  |
| 6     | Territorium, Militärgebäude, Soldatenränge, Angriff und Kampf                                    |
| 7     | Gegner-KI (3 Stufen), Spielmodi, Missionen, Sieg/Niederlage                                      |
| 8     | Speichern/Laden, Hauptmenü, Sound, Performance, Balancing, Bugfixing                             |

Jede Phase endet mit `npm test` grün, `npm run lint` sauber, lauffähigem `npm run dev`, Update von
STATUS.md und Commit.

## 4. Risiken

- **Transport-Deadlocks** (Phase 2): volle Flaggen in Zyklen. Gegenmittel: Träger tauschen Waren
  an vollen Flaggen (Gegenrichtung), Stau-Kosten im Routing, Invarianten- und Deadlock-Szenario-Tests.
- **Performance großer Karten**: Terrain-Chunks lazy rendern und cachen, nur sichtbare Chunks
  zeichnen, Pfadsuche pro Tick deckeln, Flaggen-Graph statt Knotengraph für Warenrouting.
- **Determinismus**: Keine Iteration über Objekte mit nicht-numerischer Schlüsselreihenfolge,
  keine Float-Transzendenten in der Sim, Replay-Test ab Phase 2.
- **Gebietskonflikte** (Phase 6): eindeutige Prioritätsregel (näheres Gebäude, dann ältere ID),
  danach Zusammenhangsprüfung gegen Inseln.
- **Umfang**: Phasen strikt einhalten, UI zunächst funktional (DOM-Panels), Pixel-Look im Canvas.

## 5. Annahmen

- A1: Die Karte wickelt nicht um (kein Torus wie im Original). Der Rand fällt zu Wasser ab, das
  vereinfacht Rendering und Pfadsuche ohne spielerischen Nachteil.
- A2: UI-Panels (Menüs, Infofenster, Minikarte) sind DOM-Elemente mit Pixel-Optik über dem Canvas;
  die Spielwelt wird im Canvas mit niedriger Basisauflösung gezeichnet und ganzzahlig skaliert.
- A3: Zoom = ganzzahliger Skalierungsfaktor der Basisauflösung. Vier Stufen, Ziel-Basisbreite
  ca. 960/640/480/320 Pixel (Standard 640).
- A4: Kachelmaße in Basispixeln: `TW = 32`, `TH = 16`, 1 Höheneinheit = 1 Pixel. Höhen 0…48.
- A5: Phase 1 hat noch kein Hauptmenü; Seed und Kartengröße per URL-Parameter
  (`?seed=123&size=128&players=2`), Taste `N` erzeugt eine neue Karte.
- A6: Terrain-Übergänge werden an Dreieckskanten gedithert überblendet, Küsten bekommen einen
  Sandstreifen und Schaum. Schattierung: Gouraud über die Knotenhelligkeit, quantisiert auf die
  Terrainpalette.
- A7: Kartenspeicherung als `number[]` statt Typed Arrays (JSON-Regel). Bei 256×256 sind das
  ~65k Einträge pro Array, unkritisch.
- A8: Gebiet in Phase 2: Das HQ beansprucht einen festen Radius (`STORE.HQ_RADIUS`). Das echte
  Territoriumssystem mit Militärgebäuden folgt in Phase 6.
- A9: Wird eine Flagge mit Waren abgerissen, wandern diese Waren sofort ins nächste Lager des
  Besitzers (statt verloren zu gehen). Gibt es kein Lager, werden sie im Warenbuch als zerstört
  verbucht.
- A10: Heimkehrende Siedler laufen querfeldein (A*). Ist kein Weg zum Lager möglich, werden sie
  direkt eingelagert, damit nie jemand dauerhaft hängen bleibt.
- A11: Träger holen eine Ware nur ab, wenn die Zielflagge Platz hat (inklusive angekündigter
  Lieferungen) oder dort eine Ware in Gegenrichtung zum Tausch wartet. Waren, die länger als
  `OVERFLOW_WAIT_TICKS` warten, dürfen einen kleinen Überlauf (`FLAG_OVERFLOW`) nutzen. Damit
  rotieren auch komplett volle Zyklen weiter (keine Deadlocks).
- A12: Waren für das Gebäude an der Zielflagge trägt der Träger direkt hinein, sie belegen keinen
  Flaggenplatz.
- A13: Routing pro Ware nur an Flaggen (nächste Straße), periodisch und nach Netzänderungen neu.
  Pro Abarbeitungsrunde wird je Ziel ein rückwärts berechnetes Distanzfeld geteilt.
- A14: Esel kommen in Phase 2 aus dem HQ-Startbestand; eine Eselzucht folgt mit den
  Nahrungsketten. Einmal „stark befahren" bleibt eine Straße es.
- A15: Testfunktion „Testware hierher schicken" (Taste G) existiert bis Phase 3, damit der
  Warentransport ohne Produktionsgebäude sichtbar ist.
- A16: Zierelemente (Gras, Blumen, Steinchen, Büsche, Schilf) und Wasserreflexe sind reine
  Darstellung, abgeleitet aus einem Knotenhash. Sie stehen nicht im Spielzustand und blockieren
  nichts.
- A17: Werkzeug-Modi (Auswählen, Flagge, Straße, Abreißen) über Leiste oder Tasten 1–4.
  Rechtsklick nimmt im Straßenbau den letzten Abschnitt zurück, sonst verlässt er das Werkzeug.
