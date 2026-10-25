# STATUS

## Aktuelle Phase: 8 abgeschlossen (alle geplanten Phasen fertig), dazu Rückmeldungen aus Testspielen

### Erledigt (Nachbesserungen nach Testspielen)
- Waffen wie Werkzeuge: Prioritäten für Schwert und Schild, Bestand und mögliche neue Soldaten im
  Reiter „Werkzeuge & Waffen“; die KI hält beide im Gleichgewicht; Startbestand je 10 (A57).
- Alle Waren neu als detaillierte Pixelbilder (A58).
- Arbeitsstand im Gebäudefenster mit Grund und Hinweis, Ausrufezeichen über stillstehenden
  Betrieben (A59).
- Übersichtsfenster „Reich“ mit den wichtigsten Kennzahlen (A60).
- Tests: 146.


### Erledigt (Phase 8)
- Hauptmenü mit Hintergrundpartie zwischen Computerspielern; Spielmenü mit Esc (Weiterspielen,
  Speichern, Laden, Neues Spiel, Einstellungen, Hauptmenü); Einstellungen für Geräusche, Musik,
  Ton aus, automatisches Speichern und Randscrollen (A53).
- Speichern und Laden: 5 Plätze im Browser, automatisches Speichern alle 5 Minuten Spielzeit,
  Export und Import als Datei; das KI-Gedächtnis wird mitgespeichert (A52).
- Ton: prozedurale Geräusche für Bau, Arbeit, Kampf, Eroberung, Funde, Meldungen und Aktionen,
  dazu eine kleine Musik in d-dorisch; Taste `K` schaltet stumm (A51).
- Warenverteilung für alle Spieler, die KI stellt sie nach Bedarf ein (A50).
- Performance: KI ohne Laufzeitspitzen (Distanzkarten, Bergcache, begrenzte Straßenplanung);
  Simulation mit Terrain-Cache, begrenzter Wegsuche der Arbeiter und ohne vergebliche Lager- und
  Soldatensuchen (A54, A55). Späte Partie mit 4 KIs auf 256×256 (500 Siedler): 13 ms → 2 ms pro
  Tick.
- Balancing und Fehler: mehr Startwerkzeuge, abgerissene Gebäude brennen nieder, Minikarte mit
  Straßen (A56).
- Tests (112): Spielstände (Weiterspielen nach dem Laden ergibt denselben Verlauf, Format- und
  Versionsprüfung), Verteilung, Ereignisse, Abriss.

## Davor: Phase 7

### Erledigt (Phase 7)
- Gegner-KI in drei Stufen (leicht, mittel, schwer), regelbasiert und deterministisch (A38, A39):
  Bauordnung von Holz und Stein über Nahrung bis Metall und Waffen, Bauplatzbewertung (Bäume,
  Felsen, Fisch, Feldfläche, Nähe zum Lager), kurze Anschlussstraßen, Ausdehnung zu neuem Land und
  zu Bergen, Geologen und Bergwerke an gefundenen Vorkommen, Werkzeugprioritäten nach fehlenden
  Berufen, Abriss erschöpfter Betriebe, Rückzug aus dem Hinterland, Angriffe bei ausreichender
  Überlegenheit.
- Sieg und Niederlage (A40), Zeitlimit, Startbedingungen (A41).
- Spielmodi: freies Spiel (Kartengröße, 0–3 Gegner, Stärke, Startbedingungen, Seed) und sechs
  Missionen (A42) im Dialog „Neues Spiel“ (`N`, Leistenknopf).
- Zielanzeige oben links mit Fortschritt, Restzeit und Gegnern; Meldung bei besiegten Gegnern;
  Fenster bei Sieg oder Niederlage (weiterspielen, nächste Mission, neues Spiel).
- Tests (101): Ziele, Zeitlimit, Niederlage, Startbedingungen, Serialisierung; KI auf erzeugter
  Karte (Grundwirtschaft, Ausdehnung, Baustellenlimit, Straßenanschluss), Determinismus,
  Angriffsplanung, Eroberung, Werkzeuge, Anschluss verwaister Gebäude, Laufzeit auf 256×256.
- Browser: 256×256, drei schwere Gegner, 8x-Tempo: 60 FPS, KI unter 0,1 ms pro Tick im Mittel.
- Nachbesserung der KI (A45–A49): Soldatenreserve im HQ (für alle Spieler einstellbar),
  Erzausgleich auf der Karte, Geologe bohrt im Berg, KI-Gedächtnis für Funde, Querverbindungen,
  sparsamere Straßen, Förster ohne Wald, Nahrung für Bergwerke. Messung über 6 Karten × 3 KIs
  (40 Minuten Spielzeit): Waffen stellen jetzt 12 von 18 KIs her (vorher etwa 5), deutlich mehr
  Gebiet und Soldaten.

## Davor: Phase 6

### Erledigt (Phase 6)
- Territorium mit deterministischer Konfliktregel (A33), Grenzen auf Karte und Minikarte.
- Militärgebäude Wachhütte (2 Soldaten), Wachturm (5), Festung (9); erweitern das Gebiet, sobald
  der erste Soldat eingezogen ist. Infofenster zeigt die Besatzung mit Rängen.
- Soldaten aus Träger + Schwert + Schild, Ränge 0–4, Beförderung durch Münzen (A34).
- Angriff: Klick auf ein feindliches Militärgebäude öffnet das Angriffsfenster (Anzahl −/+),
  Zweikämpfe an der Flagge mit Kampfanimation, Eroberung oder Rückzug (A35).
- Eroberung verschiebt die Grenze, fremde Gebäude auf verlorenem Gebiet brennen ab (Ruine mit
  Flammen), ein erobertes HQ wird zerstört (A36). Waren bleiben erhalten.
- Statistik: Soldaten nach Rang.
- Tests (82): Territorium, Gebietserweiterung, Soldatenentstehung, Beförderung, Eroberung mit
  Brand und Warenerhalt, Abwehr, HQ-Eroberung, deterministische Kämpfe.

## Davor: Phase 5

### Erledigt (Phase 5)
- Eisenschmelze (Eisenerz + Kohle → Eisen), Münzprägerei (Golderz + Kohle → Münzen),
  Werkzeugschmiede (Eisen + Kohle → Werkzeug nach Prioritätsliste), Waffenschmiede
  (Eisen + Kohle → Schwert/Schild im Wechsel). Neue Berufe Schmelzer, Münzpräger,
  Werkzeugschmied, Waffenschmied mit eigenen Figuren; Gebäudegrafik mit Esse und Glut.
- Berufe entstehen aus Träger + Werkzeug (seit Phase 3); fehlt das Werkzeug, bleibt der
  Arbeitsplatz offen und die Statistik zeigt ihn unter „Fehlende Werkzeuge“.
- Zentrale Buchung von Produktion und Verbrauch, Statistik-Stichproben im Weltzustand.
- Statistik-Fenster (Taste `T`, Leistenknopf): Warentabelle (Bestand/hergestellt/verbraucht),
  Verlaufsdiagramm (Bestand oder Produktion pro Minute, bis zu 4 Waren, Legende, direkte
  Beschriftung, Fadenkreuz mit Tooltip), Siedler nach Beruf, fehlende Werkzeuge, Waffenbestand,
  Prioritätsregler für alle Werkzeuge.
- Tests (74): Schmelze, Münzprägerei, Waffenschmiede, Werkzeugschmiede nach Priorität und
  im Stillstand, Verteilung im Verhältnis der Prioritäten, fehlender Beruf durch neue Werkzeuge,
  Statistik-Bilanz und Begrenzung.

## Davor: Phase 4

### Erledigt (Phase 4)
- Nahrungsgebäude: Fischer (Fischbestand an Küsten), Bauernhof (sät Felder, die in Stufen reifen,
  und erntet Weizen), Brunnen, Mühle (Weizen → Mehl), Bäckerei (Mehl + Wasser → Brot),
  Schweinezucht (Weizen + Wasser → Schwein), Metzgerei (Schwein → Fleisch).
- Bergwerke für Kohle, Eisen, Gold und Granit: nur auf Bergplätzen, verbrauchen pro Abbau eine
  Nahrungsration, Vorkommen im Radius werden erschöpft.
- Geologe: per Flaggen-Menü oder Taste `J` zu einer Flagge geschickt, Probebohrungen mit
  Schildern (nichts/wenig/viel), Schilder verschwinden nach einer Weile; Hinweis beim Überfahren.
- Neue Berufe mit eigenen Figuren (Fischer mit Angel, Bauer mit Sense, Bergmann, Geologe, …).
- Grafik: Fischerhütte, Bauernhof, Brunnen, Windmühle, Fachwerk-Bäckerei, Schweinezucht,
  Metzgerei, Stolleneingänge mit Lore je Erz, Felder in vier Stufen, Geologenschilder.
- Baumenü mit Gruppen (Holz und Stein, Nahrung, Bergbau, Lager); Infofenster der Bergwerke zeigt
  den Nahrungsvorrat.
- Eselzucht (nachgerüstet): Weizen + Wasser → Esel, der ins Lager geht und stark befahrenen
  Straßen zugeteilt wird.
- Tests (65): Eselzucht, Fischer, Bauer, Brunnen, Mühle/Bäckerei, Schweinezucht/Metzger, Kohlebergwerk mit
  Nahrungsverbrauch, Warten ohne Nahrung, Erschöpfung, Bergplatz-Regel, Geologe mit Schildern.

## Davor: Phase 3

### Erledigt (Phase 3)
- Gebäudedefinitionen (`src/data/buildings.ts`), Werte in `balance.ts`: Lagerhaus, Holzfäller,
  Förster, Steinbruch, Sägewerk (HQ bleibt Startgebäude).
- Bauplatzgrößen klein/mittel/groß/Bergwerk nach Hindernissen, Steigung, Gebiet und Flaggenplatz;
  Bauhilfe zeigt die Größen als Symbole.
- Baustellen: Absteckung, Planierer ebnet unebenen Boden (Terrain wird live neu gezeichnet),
  Bauarbeiter verbaut angelieferte Bretter/Steine, sichtbarer Baufortschritt mit Gerüst.
- Arbeiter entstehen aus Trägern plus Werkzeug (Hammer, Schaufel, Axt, Spitzhacke, Säge).
- Holzfäller fällt ausgewachsene Bäume im Radius, Förster pflanzt Setzlinge, die in Stufen
  wachsen, Steinmetz baut Felsen ab, Sägewerk macht aus Holz Bretter.
- Bedarfslogistik: Gebäude fordern Material/Eingänge aus dem nächsten Lager an, Produkte gehen
  direkt zum nächsten Abnehmer mit Bedarf, sonst ins Lager. Ausgang blockiert bei voller Flagge.
- Status „Keine Ressourcen“, „Flagge voll“, „Wartet auf Waren“, „Kein Arbeiter“, „Keine Straße zum
  Lager“; Statussymbole über Gebäuden.
- Abriss von Gebäuden und Baustellen ohne Warenverlust; Flaggenabriss reißt das Gebäude mit.
- Grafik: Hütten, Sägewerk, Lagerhaus, Setzlinge, Berufsfiguren mit Werkzeug und Arbeitsanimation.
- UI: Bauen-Werkzeug (5), Baumenü mit Gebäudebild, Kosten und Vorschau auf der Karte,
  Infofenster für Baustellen (Fortschritt, Material) und Betriebe (Status, Vorrat, Produktion,
  Arbeiter, Abriss).
- Tests (55): Bauplatzregeln, Bauablauf mit Warenbilanz, Planieren, Abriss, Holzfäller,
  Förster mit Wachstum, Steinbruch, Sägewerk, Direktlieferung an Baustellen, Determinismus.
- Im Browser durchgespielt: erster Kreislauf Holz/Stein → Gebäude läuft (z. B. 22 Bretter aus dem
  Sägewerk in ~4,5 Spielminuten).

## Davor: Phase 2 und Zwischenschritt Grafik/UX

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
- Späte Partie (35 Minuten, 4 schwere KIs, 256×256, ca. 450–500 Siedler): 1,3 ms Simulation und
  0,8 ms KI pro Tick (Node); im Browser bei 8x-Tempo 60 FPS, 3,9 ms Renderzeit pro Frame.

### Offen / mögliche nächste Schritte
- Balancing der KI auf erzarmen Karten (etwa ein Drittel der KIs bleibt militärisch schwach).
- Fischbestände wachsen nicht nach.
- Spielstände älterer Versionen werden nicht umgewandelt.

### Bekannte Punkte
- Ein Drittel der KIs findet in 40 Minuten kein passendes Erz in ihrem Land (z. B. ganz ohne Berge
  oder nur Kohle) und bleibt militärisch schwach.
- Siedler laufen auf Straßen durcheinander hindurch (kein Ausweichen), wie im Original.

### Annahmen
Siehe PLAN.md, Abschnitt 5 (A1–A60).
