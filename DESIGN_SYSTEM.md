# Urlaubstracker — Visual Direction v2

Verbindliche Gestaltungsrichtung für den Urlaubstracker. Dieses Dokument ist
die Grundlage für alle künftigen visuellen Änderungen — vor jedem Eingriff in
`styles.css` oder eine View wird hier nachgeschlagen, nicht neu erfunden.

**Status:** Richtung beschlossen, Umsetzung teilweise ausstehend. Wo sich
Ziel und aktueller Code unterscheiden, steht das explizit dabei — dieses
Dokument beschreibt nicht nur, was ist, sondern auch, wohin es geht.

---

## Designphilosophie

Ink-on-Paper-Utility mit einem einzigen wiederkehrenden Reise-Ritual. Die App
ist kein Reisetagebuch und kein Editorial-Magazin — sie wird zwanzigmal am Tag
kurz aufgemacht, oft an der Tankstelle, müde, mit einer Hand. Alles, was
Aufmerksamkeit kostet, ohne eine Frage schneller zu beantworten, ist zu viel.

Drei Sätze, die jede Entscheidung tragen:

- **Genau eine laute Zahl pro Bildschirm.** Alles andere ordnet sich unter,
  über Gewicht und Größe — nie über eine zweite Farbe oder einen zweiten
  Kasten, der um Aufmerksamkeit konkurriert.
- **Farbe ist Verdikt, nie Marke.** Sie erscheint selten und bedeutet dann
  etwas Bestimmtes (im Plan / drüber) — sie schmückt nichts.
- **Struktur ist Linie und Abstand, nie Fläche.** Ein Rahmen steht nur, wo
  etwas wirklich zusammengehört; eine Fläche nur, wo etwas tatsächlich über
  der Seite schwebt.

Wodurch man die App ohne Logo wiedererkennt: eine einzige, immer gleich
aufgebaute Tagesmarke; eine Zahl, die auf jedem Bildschirm lauter ist als
alles andere; Farbe, die ausschließlich Auskunft gibt; Haarlinien statt
Kästen; Reise-Information, die immer eine echte Zahl aus der Rechnung ist,
nie eine erfundene Ambiente-Information.

**Nicht Retro, nicht Vintage, nicht Camping, nicht Reisemagazin.** Keine
Illustration, kein dekoratives Icon, keine Textur, kein Verlauf, kein
Schatten außer dem einen für schwebende Ebenen, keine übertriebene Rundung.

---

## Typografie

### Tokens (Stand Code, unverändert gültig)

| Token | Wert | Rolle |
| --- | --- | --- |
| `--fs-display` | `clamp(2.5rem, 12.5vw, 3.2rem)` | die eine große Zahl des Tages |
| `--fs-xl` | `1.6rem` | zweite große Zahl (Kassenstand, Ausgabensumme) |
| `--fs-lg` | `1.375rem` (22px) | Seiten- und Sheet-Titel |
| `--fs-md` | `1rem` (16px) | Fließtext, Zeileninhalte |
| `--fs-sm` | `0.875rem` (14px) | Sekundär, Einordnung |
| `--fs-xs` | `0.8125rem` (13px) | Meta, die einzige kleine Stufe |

Vier Schriftgewichte, keins mehr: **400** (Standardtext), **500** (Label,
Meta, Sekundärtext), **600** (Überschrift, Geldbetrag, aktiver Zustand),
**700** (reserviert für die Tagesmarke — siehe Signature Element).

### Schriftwahl

**Sans + Sans** (`system-ui` für alles) ist der aktuelle Stand. Sicher, aber
liefert keine Wiedererkennung über Typografie — jede Plattform rendert eine
andere Grotesk, die gesamte Identität hängt an Marker, Farbe und Abstand.

**Sans + Serif** ist abgelehnt. Eine Serife für die Display-Zahl ist die
Standardformel für Reise-Editorial (Boutique-Hotel-Branding, Content-Marke)
— das verbotene Ergebnis. Dazu ein technisches Argument: Die wichtigste
typografische Aufgabe der App ist „eine große Geldzahl in unter einer
Sekunde lesen“, und Groteskschriften sind dafür nachweislich besser
geeignet als Serifen.

**Sans + eine charaktervolle/condensed Sans, ausschließlich für kurze
Marker** ist die gewählte Richtung. Eine schmalere, getrackte Grotesk nur für
die Tagesmarke und vergleichbare Kurzlabels — nie für die große Zahl, nie für
Fließtext — liest sich wie Wegleitsystem oder Frachtbrief: modern,
transport-codiert, ausdrücklich keine Vintage-Postkartenschrift.

**Umsetzung in zwei Stufen:**

1. **Sofort, ohne neue Abhängigkeit:** weiterhin `system-ui`, aber
   Marker-Text bekommt Versalien, weite Sperrung (`letter-spacing`) und
   tabellarische Ziffern (`font-variant-numeric: tabular-nums`). Das erzeugt
   spürbaren Charakterunterschied zum Fließtext, ohne einen Font zu laden.
2. **Später, als bewusste Einzelentscheidung:** eine einzelne statische
   Schnittgewicht-Datei einer echten Condensed Grotesk, ausschließlich für
   Marker-Text. Kein stiller Import — diese Stufe braucht eine eigene
   Freigabe, weil sie die bestehende Vorgabe „keine externe Schrift“ bricht.

Echte Condensed-Charakteristik lässt sich nicht per CSS faken:
`transform: scaleX()` verzerrt Buchstabenformen sichtbar und wäre selbst ein
Slop-Merkmal. Stufe 1 ist deshalb kein Kompromiss, sondern der ehrliche
Zwischenstand, bis Stufe 2 freigegeben wird.

---

## Farbpalette

### Bleibt unverändert

| Token | Wert | Rolle |
| --- | --- | --- |
| „Papier“ (`--bg`) | `#f8f7f4` | Grund, warmes Weiß statt kühles Grau |
| „Tinte“ (`--text`) | `#1b1a17` | Haupttext |
| `--text-muted` | `#6b655c` | Sekundärtext |
| `--text-faint` | `#8f887d` | Meta-Text |
| `--over` | `#b8123c` | Überzogen — Karmesin, nicht reise-codiert, unverändert gut |

„Papier“ und „Tinte“ als Namen sind eine bewusste, kostenlose
Identitätsmaßnahme: Sie kodieren die Reise-Metapher im Token-*Namen*, nicht
im Rendering. Das bleibt eine Metapher im Code-Kommentar — niemals sichtbare
Papierstruktur, Vergilbung oder Rissrand. Das wäre der Schritt zurück zu
Vintage-Tagebuch.

### Ändert sich: Akzentfarbe

Aktueller Code: `--accent: #0f766e` (hell) / `#38bfae` (dunkel) — sitzt mitten
im Fintech-/SaaS-Teal (Stripe, Notion, Linear). Verworfener Vorschlag:
„Expedition Green“ `#2f5d3f` — ein dunkles, gelbstichiges Waldgrün, exakt der
Farbraum von REI, Patagonia, AllTrails, Gaia GPS. Dass die Farbe einen
Marketingnamen braucht, um nach Identität auszusehen, ist selbst das
Warnsignal.

**Zielrichtung:** kein dritter Modeton, sondern eine Verschärfung eines
Prinzips, das im Code schon angelegt ist (Kommentar im bestehenden CSS:
„Gut hat keine eigene Farbe mehr — gut heißt jetzt schlicht nicht rot“). Die
Akzentfarbe wird noch dunkler, noch näher an Tinte gezogen, sodass sie kaum
als Marke, sondern fast als getönte Tinte wirkt.

| Token | Richtwert hell | Richtwert dunkel |
| --- | --- | --- |
| `--accent` | `#2c4a44` (sehr dunkles, blaustichiges Tannengrau) | ein entsättigtes, kein leuchtendes Salbeigrün — heller/grauer als das aktuelle `#38bfae`, genauer Wert noch offen |

Farbton ~172° (blaugrün, kein Gelbstich wie Waldgrün), niedrige Sättigung,
niedriger Hellwert. Das vermeidet sowohl Camping (kein Gelbstich) als auch
Fintech (kein heller, satter Ton). **Diese Werte sind Richtwerte, keine
finalen Tokens — Kontrast gegen Papier/Tinte muss vor dem Einbau geprüft
werden.**

### Ändert sich: Benennung, nicht die Farbe

`--warn: #a4600b` bleibt als Farbwert — ein gedecktes Bernstein, das schon
erdig genug ist. Verworfen wird nur der Name „Sunset Orange“: ein
Sonnenuntergang ist die klischierteste Reise-App-Dekoration überhaupt, und
das gilt für die Benennung unabhängig vom Hexwert. Der Token heißt schlicht
„Amber“ / `--warn`, ohne Szenerie-Assoziation.

---

## Signature Element: die Tagesmarke

Die Tagesmarke bleibt das eine wiederkehrende Element — die Grundrichtung
aus dem vorherigen Durchgang war richtig. Verschärfung gegenüber dem
aktuellen Stand (`TAG 12 / 14 · 1. SEPTEMBER` in `today.js`):

- Tag-Bruch und Datum bekommen **tabellarische Ziffern**, damit sie über
  verschiedene Bildschirme hinweg immer dieselbe Breite einnehmen — das
  Gefühl „gebaut“, nicht „hingeschrieben“.
- Der Mittelpunkt (`·`) wird zu einer echten, dünnen **vertikalen
  Haarlinie** statt eines Satzzeichens — dieselbe visuelle Sprache wie der
  Rest der App (Linien statt Zeichen als Trenner), kein isolierter
  typografischer Trick.
- Kein Icon, keine Farbe, keine Pillenform. Reiner Text plus eine Linie.
- Erscheint nur während der laufenden Reise (Phase „during“) — davor und
  danach hat der Hero bereits einen eigenen Kontextsatz, eine zweite Marke
  wäre dort Redundanz ohne Zweck.

Wichtig: Das Element ist kein einmaliges Widget, sondern ein
**wiederverwendbares Muster** — „eine getrackte, tabellarische Meta-Zeile
mit Haarlinien-Trenner, überall dort, wo ein Bildschirm behaupten muss,
welcher Tag/Eintrag gemeint ist“. Heute nur auf „Heute“ verwendet, aber als
Prinzip definiert, nicht als Einzelfall.

Route-Punkte (`●────●────●────●`) sind **bewusst nicht** Teil des Systems:
Sie würden den bereits vorhandenen Tagesbudget-Fortschrittsbalken
verdoppeln — zwei Fortschrittsanzeigen für denselben Sachverhalt ist
Überladung, kein zusätzlicher Charakter.

---

## Komponentensprache

- **Haarlinie statt Kasten.** Struktur entsteht über `border-top`/`gap`
  zwischen Listenelementen, nicht über Hintergrund und Rahmen um eine
  Gruppe.
- **Fläche nur für schwebende Ebenen.** Hintergrund plus Schatten ist
  reserviert für Bottom-Sheet, Toast, FAB — alles, was wirklich über dem
  Inhalt liegt. Niemals zum Gruppieren von flachem Inhalt.
- **Icons nur mit Funktion.** Erlaubt: Kategorie-Symbole (Typ einer Zeile
  beim Scannen erkennen), Systemstatus (Sync, Warnung). Verboten: ein Icon,
  das nur wiederholt, was der Text daneben ohnehin sagt.
- **Pillenform nur für Filter, Status, Tag.** Normale Knöpfe, Sheets,
  Eingabefelder bekommen `--radius`, nie `--radius-pill`.
- **Zahlen sind immer `font-variant-numeric: tabular-nums` und Gewicht
  600.** Eine durchgehende Regel, die Beträge im ganzen Interface gleich
  behandelt, unabhängig von der Komponente.

---

## Layoutprinzipien

- Genau eine laute Zahl pro Bildschirm — der Rest liegt in Sekundär- oder
  Meta-Registern.
- Abstand zwischen Abschnitten ist größer als Abstand innerhalb einer
  Zeile (`--view`-Gap > `--section`-Gap > Zeilen-internes Gap). Das ist der
  wirksamste Hebel gegen „gedrängt“ — er wirkt zwischen Bedeutungseinheiten,
  nicht in jeder einzelnen Zeile.
- Kein Element ohne Datenbezug. Jede sichtbare Reise-Information (Tag,
  Datum, Kategorie, Betrag) ist ein echtes Feld oder eine echte Berechnung
  der App — nie eine erfundene Ambiente-Angabe. Die App trackt keinen
  Standort; „wo bin ich“ heißt hier zeitliche Position im Trip, nicht Geo.

### „Heute“ als Master-Screen, von oben nach unten

1. **Kopfzeile** (fix, über allen vier Tabs): Name der Kasse, klein, ruhig
   — beantwortet *welche Reise*. Sync-Status monochrom, Farbe nur bei
   Problem.
2. **Tagesmarke** — Tag-Bruch, Datum, Haarlinien-Trenner — beantwortet
   *welcher Tag*.
3. **Die große Zahl** — heute noch verfügbares Geld, größte Größe,
   Gewicht 600, tabellarisch, ohne Fläche, ohne Icon. Leiser Label-Satz
   darüber, leiser Kontextsatz darunter. Beantwortet *wie steht es
   finanziell* — muss lauter bleiben als die Marke darüber.
4. **Ein Haarlinien-Fortschrittsbalken** direkt darunter — Tagesbudget
   gegen Ist, farblos im Normalfall, eingefärbt nur bei Kippen ins
   Warnung/Über.
5. **Dreier-Kennzahlreihe** (Verfügbar / Noch / Polster), Haarlinien
   zwischen den Spalten statt Kästen — die größere Perspektive in einer
   Zeile.
6. **Handlungsebene**, durch größeren Abschnittsabstand getrennt: fällige
   Vormerkungen zuerst (dringlicher), dann heutige Einträge als flache
   Haarlinien-Liste. Beantwortet *was kann ich jetzt tun*.
7. **Fester Bedienrahmen**, unverändert: Bottom-Navigation, schwebender
   Ausgabe-Knopf. Teil des Betriebsrahmens, nicht Teil des
   Identitätssystems — wird nicht als „Gestaltungsfläche“ behandelt.

---

## Copy-Prinzipien

- Aussage. Punkt.
- Doppelpunkt für Aufzählung.
- Zeilenumbruch für getrennte Gedanken.
- `·` nur für kompakte Metadaten (nie in Fließtext-Sätzen).
- Maximal ein Gedankenstrich pro Satz — meistens keiner. Nie die
  Konstruktion „Aussage — Erklärung — Einschränkung“.
- Keine künstlichen ALL-CAPS-Labels für normale UI-Texte. Versalien sind
  der Tagesmarke vorbehalten, wo sie als bewusstes visuelles Metadatum
  funktionieren — nicht als generelles Stilmittel.

---

## Anti-Slop-Regeln

Verbindlich für jede künftige UI-Änderung, konkret und überprüfbar:

1. Jede Schriftgröße nutzt eines der fünf Token (Display/Heading/Body/
   Sekundär/Meta) — ein neuer `rem`/`px`-Wert außerhalb von `:root` ist
   nicht erlaubt, auch nicht „nur dieses eine Mal“.
2. Jedes Schriftgewicht ist exakt 400, 500, 600 oder 700 — kein anderer
   Zahlenwert wird geschrieben.
3. Kein neuer `border-radius`-Wert ohne Eintrag in die Radius-Token
   (`--radius` / `--radius-sm` / `--radius-pill`) — nie ein handgetippter
   Px-Wert an einer einzelnen Komponente.
4. Keine neue Fläche mit Hintergrund oder Schatten, um Inhalt zu
   gruppieren, den Haarlinie plus Abstand genauso gruppieren könnten — eine
   Fläche ist nur für etwas erlaubt, das wirklich über der Seite schwebt.
5. Kein neues Icon, außer es hilft, den Typ einer Zeile beim Scannen zu
   erkennen oder zeigt einen Live-Systemzustand — ein Icon, das nur
   wiederholt, was der Text daneben sagt, fliegt raus statt rein.
6. Jede Farbe bildet einen der bestehenden semantischen Slots ab (Tinte,
   Akzent, Warn, Über) — eine „Marken“-Farbe nur zur optischen Auflockerung
   wird abgelehnt; jeder neue Farbton wird vorher gegen
   Camping-/Fintech-/Finanz-App-Klischees geprüft.
7. Kein Verlauf, kein Schatten außer dem einen `--shadow-float`, keine
   Textur, keine Illustration, kein Foto irgendwo in der ausgelieferten UI.
8. Jedes neue „Reise“-Element muss auf ein Feld zurückführbar sein, das
   die App bereits speichert oder berechnet — ein Stimmungselement rein zur
   Deko (Zitat, Stempel, Wetter, Bild) wird abgelehnt, auch wenn es hübsch
   aussieht.
9. Nie mehr als ein Gedankenstrich pro Satz, und nie einer, wo Punkt,
   Doppelpunkt oder Zeilenumbruch besser lesen — das wird an jedem neuen
   Textstring geprüft, nicht angenommen.
10. Vor jeder visuellen Änderung: ein echter Vorher/Nachher-Screenshot bei
    360–390px Breite, hell und dunkel. Eine Änderung, die niemand gerendert
    gesehen hat, gilt nicht als fertig, egal wie korrekt das CSS aussieht.

---

## Offene Umsetzungsschritte

Was dieses Dokument beschließt, aber noch nicht im Code steht:

- [ ] `--accent` (hell/dunkel) auf die Tannengrau-Richtwerte umstellen,
      Kontrast gegen Papier/Tinte vorher prüfen.
- [ ] `--warn`-Kommentar/Namen von „Sunset“-Assoziation lösen (Farbwert
      bleibt).
- [ ] Tagesmarke: tabellarische Ziffern, Mittelpunkt durch Haarlinie
      ersetzen.
- [ ] Marker-Typografie: Versalien + Sperrung als Sofortlösung (kein neuer
      Font).
- [ ] Bei Bedarf später, mit eigener Freigabe: echte Condensed-Grotesk für
      Marker-Text einführen.
