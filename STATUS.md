# STATUS

## Aktuelle Phase: 2 abgeschlossen, Zwischenschritt Grafik/UX erledigt

### Erledigt (Zwischenschritt Grafik und Bedienung)
- Terrain: geditherte Übergänge zwischen Terraintypen, Sandstreifen und Schaum an Küsten,
  Grashalme, Gesteinsschichten, Dünenrippel, Sumpftümpel; animierte Wasserreflexe.
- Zierelemente (Gras, Blumen, Steinchen, Büsche, Pilze, Schilf, Wüstengras), rein optisch.
- Sprites neu: Eiche, Birke, zwei Nadelbäume mit Windanimation; facettierte Felsen mit Moos;
  Burg mit Rundtürmen, Bergfried, Toren, Fenstern, Bannern; Träger mit Hut, Gürtel, Laufzyklus,
  mit/ohne Last; Esel mit Packsattel; wehende Flaggen; einzeln erkennbare Werkzeug-Waren;
  Schlagschatten für alle Objekte und Figuren.
- Standardzoom eine Stufe weiter (Basisbreite 640), vier Zoomstufen.
- Bedienung: Werkzeugleiste mit Pixel-Icons und Tastenkürzeln, Werkzeug-Modi, Geisterflagge und
  Hinweistext am Mauszeiger, Kontextmenü mit Kürzeln, Infofenster mit festem Kopf,
  Schließen-Knopf, Warenraster mit Symbolen und Flaggenplätzen, Temposteuerung mit Knöpfen,
  Pause-Anzeige, Hilfefenster (F1), Randscrollen, Mauszeiger je Werkzeug.

### Erledigt (Phase 2)
- Hauptquartier mit Warenlager und Personen (Träger, Esel), Startbestand aus `balance.ts`,
  Gebiet im festen Radius, Trägernachschub über die Zeit.
- Flaggen: Platzierungsregeln (eigenes Gebiet, Terrain, frei, Mindestabstand 2), Abriss;
  Setzen auf einer Straße teilt sie (Träger bleiben auf ihrer Hälfte).
- Straßen: Pfadvalidierung (Nachbarschaft, max. Steigung, keine Kreuzungen, Richtungsslots),
  automatische Zwischenflaggen, Laufzeit abhängig von der Steigung, Abriss ohne Warenverlust.
- Träger: Zustandsautomat (anreisen, Mitte, abholen, tragen, ablegen, ins Gebäude tragen, heim),
  eine Ware gleichzeitig, Rücktransport in Gegenrichtung, Tausch an vollen Flaggen.
- Routing: Flaggen-Graph, Kantenkosten = Laufzeit + Stau-Zuschlag, gedeckelte Routen pro Tick,
  Neuberechnung periodisch und nach Netzänderungen, geteilte Distanzfelder pro Ziel.
- Staffelprinzip mit sichtbaren Staus, Notfall-Überlauf gegen Zyklus-Deadlocks.
- Esel: stark befahrene Straßen (Schwelle in `balance.ts`) werden gepflastert dargestellt und
  bekommen einen Esel als zweiten Träger.
- Warenbuch pro Spieler und Invariantenprüfung (`src/sim/invariants.ts`).
- Darstellung: HQ-Burg, wehende Flaggen, Grenzpfähle, Straßen (Erde/Pflaster), Träger und Esel
  mit Laufanimation und Interpolation, Waren auf Flaggen und in Trägerhänden.
- UI: Kontextmenü per Linksklick, Straßenbau-Modus mit Vorschau und Steigungsfarben,
  Infofenster (HQ-Bestand, Flaggenwaren, Straßenstatus), Meldungen, Bauhilfe (H),
  Stau-Overlay (V), Debug-Overlay mit Flaggen-IDs und Route der markierten Ware.
- Tests (43): Flaggen-/Straßenregeln, Teilen, Trägeranreise, Warenfluss hin und zurück, Stau,
  volle Zyklen ohne Deadlock, Routing mit Stau-Kosten, Straßen- und Flaggenabriss ohne
  Warenverlust, Esel, Replay-Determinismus, Speichern/Laden mitten im Spiel, Performance.

### Gemessen
- Simulation: 760 Träger, 1200 Waren auf einem Straßengitter: ca. 0,5 ms pro Tick (Vitest, Node).
- Browser (Chromium headless, 1280×720, 256×256-Karte, 8x-Tempo, ~440 Siedler): 60 FPS,
  ca. 1,8 ms Renderzeit pro Frame.

### Offen / nächste Schritte (Phase 3)
- Baustellen, Bauarbeiter, Planierer, Bauplatzgrößen.
- Holzfäller, Förster, Sägewerk, Steinbruch; erster Kreislauf Holz/Stein → Gebäude.
- Bedarfsgesteuerte Lieferungen (Anforderungen) statt Testwaren.

### Bekannte Punkte
- Minikarte zeigt noch keine Straßen und Grenzen (Phase 6 mit Territorium).
- Kein Hauptmenü, Seed/Größe/Spieler per URL (Annahme A5).
- Siedler laufen auf Straßen durcheinander hindurch (kein Ausweichen), wie im Original.

### Annahmen
Siehe PLAN.md, Abschnitt 5 (A1–A17).
