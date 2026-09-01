# Urlaubstracker

Eine gemeinsame Urlaubskasse für alle, die zusammen unterwegs sind — als
installierbare Web-App (PWA). Zu zweit, zu acht oder allein.

Ihr tragt ein, was jede:r aufs gemeinsame Konto überwiesen hat. Daraus rechnet
die App aus, wie viel pro Tag drin ist. Unterwegs hakt ihr in ein paar Sekunden
ab, was ihr ausgegeben habt, und seht auf einen Blick, was heute noch übrig ist.
Am Ende steht die Abrechnung: wer wem noch was überweist.

Läuft offline, auf allen Geräten der Gruppe, ohne Abo.

---

## Was drin ist

| Bereich | Was ihr dort tut |
| --- | --- |
| **Heute** | Eine große Zahl: was heute noch übrig ist. Darunter drei Kennzahlen — verfügbar, Resttage, Polster — und die Einträge des Tages. |
| **Ausgaben** | Alles nach Tagen gruppiert, mit Filter nach Kategorie. Antippen zum Ändern. |
| **Budget** | Einzahlungen, Verlauf über den Urlaub, Aufteilung nach Kategorie, Endabrechnung. |
| **Mehr** | Zeitraum, Währung, Reisegruppe, Kostenaufteilung, Synchronisierung, Export. |

Weitere Kleinigkeiten:

- **Eigene Zahlentastatur** — große Tasten, eine Komma-Taste, keine Systemtastatur,
  die das halbe Sheet verdeckt. Betrag, Kategorie, Tag und der Speichern-Knopf
  passen zusammen auf einen Handyschirm; alles Seltenere liegt unter *Details*.
- **Rückgängig** — nach jedem Eintrag steht kurz ein „Rückgängig“ daneben. Ein
  Vertipper kostet damit einen Tipp statt vier.
- **Nochmal** — neben jeder Ausgabe sitzt ein Knopf, der sie mit dem heutigen
  Datum noch einmal einträgt: gleicher Betrag, gleiche Kategorie. Kaffee,
  Parken und Maut sind Wiederholungstäter.
- **Von wem** — sind mehrere Geräte verbunden, steht an jedem Eintrag, wer ihn
  getippt hat. Damit landet die Runde nach dem Abendessen nicht zweimal in der
  Liste.
- **Hell oder dunkel** — unter *Mehr → Aussehen*. Standard ist „Automatisch“:
  die App folgt dem Handy.
- **Bezahlt von** — aus der gemeinsamen Kasse oder aus eigener Tasche. Beides
  zählt in der Endabrechnung richtig. Wer mehrmals hintereinander privat zahlt,
  stellt das nur einmal um: die Wahl bleibt bis zum nächsten App-Start stehen
  und steht immer sichtbar in der Detailzeile.
- **Verplant** — Ausgaben, die feststehen, aber noch nicht bezahlt sind (Hotel,
  Mietwagen, Bootstour). Sie werden vom Tagesbudget abgezogen, bevor geteilt
  wird. Ein Tipp auf den Haken macht daraus eine bezahlte Ausgabe.
- **Beitreten mit Name und Passwort** — beim Anlegen bekommt die Kasse beides.
  Wer die zwei Angaben hat, kommt herein; ein Link muss dafür nicht mehr durch
  die Gegend geschickt werden.
- **Offline** — die App startet ohne Netz, Eingaben werden nachgereicht.
- **Export** — CSV für Excel, JSON als Sicherungskopie.

---

## Die Reisegruppe

Beim Anlegen tragt ihr ein, wer mitfährt — **eine bis acht Personen**. Das erste
Feld ist immer die Person am Gerät; daran erkennt die App später, wem privat
bezahlte Ausgaben gehören. Wer allein reist, lässt die zweite Zeile einfach leer.

Unter *Mehr → Reisegruppe* lässt sich das jederzeit ändern:

- **Namen ändern** geht immer.
- **Person hinzufügen**, wenn unterwegs jemand dazukommt.
- **Person entfernen**, solange kein Geld an ihr hängt. Sobald sie eingezahlt
  oder etwas privat bezahlt hat, bleibt sie drin — sonst stünde in der
  Abrechnung eine Einzahlung ohne Einzahler.
- **„Das bin ich“** sagt, wer an diesem Gerät sitzt. Fehlt die Angabe (etwa
  direkt nach dem Beitritt über eine Einladung), fragt die App auf *Heute*
  danach — und wer noch gar nicht in der Liste steht, trägt sich dort selbst ein.

**Kosten aufteilen:** zu zweit ein Schieberegler (Standard halbe-halbe), ab drei
Personen Anteile — ein Anteil je Person, zwei für wen doppelt so viel trägt. Die
Prozentzahl steht daneben. Das zählt ausschließlich für die Endabrechnung, nie
für das Tagesbudget.

---

## Wie das Tagesbudget gerechnet wird

Es gibt zwei Modi (umstellbar unter *Mehr → Tagesbudget*):

Verplantes Geld ist in beiden Modi vorab abgezogen: es steht zwar noch auf dem
Konto, ist aber schon vergeben. Aus 2000 € Kasse mit 250 € Verplantem werden
also 1750 €, die sich auf die Urlaubstage verteilen. Wird die Vormerkung bezahlt,
bleibt das Tagesbudget stehen — das Geld war ja nie Teil davon.

**Mitwachsend** (Standard)

```
Verfügbar        = Gesamtbudget − Verplantes
Tagesbudget heute = (Verfügbar − alles vor heute Ausgegebene) ÷ verbleibende Tage
```

Jeden Morgen neu gerechnet. Ein teurer Tag baut keine Schuld auf, er verteilt
sich still auf den Rest. Das ist der entspannte Modus: ihr müsst nichts
„aufholen“.

**Fester Satz**

```
Tagesbudget = (Gesamtbudget − Verplantes) ÷ Urlaubstage
```

Jeden Tag derselbe Betrag. Ob ihr insgesamt vor oder hinter dem Plan liegt,
zeigt die Kennzahl **Polster**.

Wichtig: Das Tagesbudget wird immer aus dem Stand von *heute früh* gerechnet.
Sonst würde die Zahl beim Eintragen einer Ausgabe unter den Fingern schrumpfen.

### Endabrechnung

Getragen hat jede Person, was sie **eingezahlt** hat plus was sie **aus eigener
Tasche** bezahlt hat. Fair wäre ihr Anteil an den Gesamtausgaben (standardmäßig
gleichmäßig geteilt, unter *Mehr → Kosten aufteilen* änderbar). Die Differenz ist
ihr Guthaben — und die Summe aller Guthaben ist genau das, was noch auf dem
gemeinsamen Konto liegt.

Daraus wird eine Liste von Überweisungen: erst geht das Restgeld vom Konto an
die Guthaben zurück, was dann noch offen ist, überweist man sich direkt.

Solange der Urlaub läuft, ist das ein Zwischenstand und keine Anweisung —
deshalb steht die Liste bis zum letzten Urlaubstag zugeklappt unter
*Zwischenstand ansehen* und ist als **Stand jetzt** gekennzeichnet.

Ist vom Konto mehr abgegangen, als eingezahlt wurde, steht es im Minus — dann
dreht sich der erste Schritt um: die Liste sagt, wer wie viel **nachzahlt**,
bis das Konto wieder auf null ist.

---

## Loslegen

Die App öffnen — fertig. Beim ersten Start legt ihr den Urlaub an: Name,
Zeitraum und wer mitreist. Sie läuft dann erst mal nur auf diesem Gerät.

### Auf dem Handy installieren

- **Android/Chrome:** Menü → *Zum Startbildschirm hinzufügen* (oder der
  Installationshinweis, der von selbst auftaucht).
- **iPhone/Safari:** Teilen-Symbol → *Zum Home-Bildschirm*.

Danach startet sie wie eine normale App, im Vollbild und ohne Adresszeile. Ein
langer Druck auf das Symbol bietet *Ausgabe eintragen* an — das öffnet direkt
die Zahlentastatur.

Solange die Seite im Browser-Tab läuft (auch über den Einladungslink — dazu
gleich mehr), zeigt sie unter *Mehr → Dieses Gerät* zusätzlich eine Zeile *Als
App installieren*. Auf Chrome/Edge löst sie den eingebauten Dialog aus, sonst
eine kurze Anleitung.

> **Warum ein Einladungslink im Browser statt in der installierten App
> öffnet:** Das entscheidet das Betriebssystem, nicht diese Seite — dagegen
> hilft kein Trick im Code. Auf iOS/Safari geht es grundsätzlich nicht: Links
> zu einer zum Home-Bildschirm hinzugefügten Web-App öffnen dort immer in
> Safari. Auf Android/Chrome geht es, aber nur nach einem manuellen Schritt
> pro Gerät: *Android-Einstellungen → Apps → Urlaubskasse → Geöffnet als
> Standard → Unterstützte Links öffnen* aktivieren.

---

## Gemeinsam nutzen (Firebase Firestore)

Damit alle Geräte denselben Stand sehen, braucht es einmalig ein kostenloses
Firebase-Projekt. Danach synchronisiert sich alles von selbst — auch mit
schlechtem Empfang, weil Firestore Eingaben lokal zwischenspeichert und
nachreicht.

### 1. Firebase-Projekt anlegen

1. Auf [console.firebase.google.com](https://console.firebase.google.com) ein
   Projekt anlegen (Google Analytics kann aus bleiben).
2. **Build → Firestore Database → Datenbank erstellen.**
   Als Modus *Produktion* wählen, Region z. B. `eur3 (europe-west)`.
3. **Build → Authentication → Sign-in method → Anonym** aktivieren.
   Die App meldet die Geräte anonym an; niemand muss ein Konto anlegen.

### 2. Sicherheitsregeln veröffentlichen

Den Inhalt von [`firestore.rules`](firestore.rules) in der Konsole unter
*Firestore Database → Regeln* einfügen und veröffentlichen — oder mit der CLI:

```sh
npx firebase-tools deploy --only firestore:rules
```

Ohne diesen Schritt lehnt Firestore alle Zugriffe ab und die App meldet
„Kein Zugriff auf diese Kasse“.

### 3. Web-App anlegen und Konfiguration einfügen

1. In der Konsole: *Projektübersicht → Zahnrad → Projekteinstellungen →
   Meine Apps → Web-App hinzufügen* (das `</>`-Symbol).
2. Firebase zeigt einen Block wie diesen:

   ```js
   const firebaseConfig = {
     apiKey: "…",
     authDomain: "…firebaseapp.com",
     projectId: "…",
     appId: "1:…:web:…"
   };
   ```

3. In der App: **Mehr → Mit Firebase verbinden**, den Block hineinkopieren,
   Name und Passwort der Kasse bestätigen, *Verbinden und hochladen*. Der
   bestehende Trip wandert mitsamt allen Einträgen in die Cloud.

Wollt ihr, dass **alle** Geräte das Projekt von selbst kennen — dann reichen zum
Beitreten wirklich nur Name und Passwort —, legt die Konfiguration einmal neben
`index.html`:

```sh
cp firebase-config.example.json firebase-config.json   # Werte eintragen, committen
```

Die Datei ist optional und kein Geheimnis: dieselben Angaben stehen bei jeder
Web-App im Quelltext. Geschützt wird die Kasse über die Sicherheitsregeln und
das Passwort. Ohne die Datei geht alles wie bisher — dann bringt der
Einladungslink die Konfiguration mit.

### 4. Die anderen Geräte dazuholen

Jede Kasse hat einen **Namen** und ein **Passwort**; beides legt ihr beim
Anlegen fest und findet es unter *Mehr → Beitrittsdaten*. Damit kommen die
anderen herein:

**App öffnen → „Einer bestehenden Kasse beitreten“ → Name und Passwort
eintragen.** Danach fragt die App, wer an dem Gerät sitzt; wer noch nicht in der
Liste steht, trägt sich dort selbst ein. Bis zu acht Geräte hängen an einer
Kasse.

- Beim **Namen** ist die Schreibweise egal: Groß- und Kleinschreibung,
  Bindestriche und doppelte Leerzeichen macht die App gleich. Er muss im
  Firebase-Projekt einmalig sein und lässt sich später nicht mehr ändern — die
  Kasse umbenennen geht trotzdem, zum Beitreten zählt dann weiter der alte Name.
- Beim **Passwort** zählt jedes Zeichen. Es steht nirgends in der Datenbank:
  dorthin wandert nur ein daraus gerechneter Nachweis (PBKDF2), den die
  Sicherheitsregeln vergleichen.
- **Mehr → Beitrittsdaten → Passwort ändern** sperrt alle aus, die es noch nicht
  benutzt haben. Wer schon dabei ist, bleibt dabei.
- Der **Einladungslink** gibt es weiterhin (*Beitrittsdaten → Stattdessen
  Einladungslink*). Er ist der bequemste Weg für Geräte, die das
  Firebase-Projekt noch nicht kennen — er bringt die Konfiguration mit.

> Name und Passwort sind zusammen der Schlüssel zur Kasse. Sie gehören in einen
> privaten Chat oder ins Gespräch, nicht in eine öffentliche Gruppe.

---

## Veröffentlichen (Cloudflare Pages)

Der Code liegt auf GitHub, ausgeliefert wird über **Cloudflare Pages**, die
Daten liegen in **Firebase Firestore**. Cloudflare hängt direkt am Repository:
jeder Push auf `main` wird von selbst gebaut und veröffentlicht — HTTPS
inklusive, was eine PWA ohnehin braucht.

### Einmalig einrichten

In *Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git*
das Repository auswählen und einstellen:

| Feld | Wert |
| --- | --- |
| Production branch | `main` |
| Build command | `npm test` |
| Build output directory | `/` |

Es gibt keinen Build-Schritt — der Browser lädt die ES-Module direkt, das
Ausgabeverzeichnis ist deshalb die Wurzel. `npm test` als Build-Befehl ist kein
Bauen, sondern eine Bremse: schlägt ein Test fehl, bricht Cloudflare ab und die
bisherige Fassung bleibt online.

Ausgeliefert wird damit auch, was nur zur Entwicklung gehört (`tests/`,
`tools/`, `package.json`). Das ist harmlos — es steht ohnehin öffentlich auf
GitHub.

### Kopfzeilen

[`_headers`](_headers) sorgt dafür, dass `sw.js`, die App-Hülle und das
Manifest nicht aus einem Zwischenspeicher kommen. Ohne das könnte Cloudflare
eine alte `sw.js` ausliefern — und dann bemerkt niemand, dass es eine neue
Fassung gibt.

Eine `_redirects`-Datei gibt es bewusst **nicht**. Die App routet über das
Fragment (`#/budget`), es wird also nie ein anderer Pfad als `/` angefragt. Ein
Auffang-Rewrite `/* → /index.html` würde nur Schaden anrichten: eine fehlende
JavaScript-Datei käme dann als HTML mit Status 200 zurück, und der Service
Worker legte sie in dieser Form in den Cache, statt die Installation abzubrechen.

### Firestore-Regeln

Die Regeln liegen nicht bei Cloudflare, sondern bei Firebase, und werden von
Hand veröffentlicht — entweder in der Konsole oder mit:

```sh
npx firebase-tools deploy --only firestore:rules
```

### Tests

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) prüft bei jedem Push und
Pull Request. Veröffentlicht wird dort nichts mehr; das macht Cloudflare.

---

## Entwickeln

```sh
npm test      # Tests (node --test, ohne Abhängigkeiten)
npm start     # lokaler Server auf http://localhost:8080
```

Es gibt keinen Build-Schritt: der Browser lädt die ES-Module direkt. Auf
`localhost` ist der Service Worker abgeschaltet — Änderungen sind sofort nach
dem Neuladen da. Mit `http://localhost:8080/?sw=1` lässt er sich einschalten,
um den Update-Ablauf auszuprobieren.

### Aufbau

```
index.html            App-Hülle
styles.css            komplettes Stylesheet, helle und dunkle Farbwerte
sw.js                 Service Worker: Offline-Betrieb und Update-Steuerung
manifest.webmanifest  Installation als App
_headers              Kopfzeilen für Cloudflare Pages
firestore.rules       Zugriffsregeln für Firestore
firebase-config.example.json  Vorlage: als firebase-config.json ausliefern, dann
                      kennt jedes Gerät das Firebase-Projekt der Gruppe

js/
  app.js              Kopfzeile, Navigation, Schnelleingabe
  calc.js             die gesamte Rechenlogik, ohne DOM — hier sitzt die Wahrheit
  store.js            Zustand und Schreibvorgänge
  backend-local.js    Speicherung im Gerät
  backend-firestore.js  Synchronisierung über mehrere Geräte
  prefs.js            geräteeigene Einstellungen (auch hell/dunkel)
  join.js             Name + Passwort → Kennung und Nachweis der Kasse
  link.js             Einladungslinks, CSV- und JSON-Export
  dom.js  format.js   kleine Helfer
  ui/                 Sheets, Zahlentastatur, wiederkehrende Bausteine
  views/              die vier Bereiche plus Ersteinrichtung

tests/                Rechenlogik, Im-/Export, Release-Invarianten
tools/                Icon-Generator, Dev-Server, Firebase-Bündelung
vendor/firebase.js    gebündeltes Firebase-SDK (kein CDN nötig)
```

Beträge liegen überall als **ganzzahlige Cent** vor, Datumsangaben als
`YYYY-MM-DD` und werden als Kalendertage behandelt — nicht als Zeitpunkte.
Deshalb stimmt die Rechnung auch über die Zeitumstellung hinweg.

### Eine neue Fassung veröffentlichen

`APP_VERSION` in [`sw.js`](sw.js) hochzählen und `data-version` in
[`index.html`](index.html) sowie `version` in `package.json` mitziehen —
`npm test` besteht nur, wenn alle drei übereinstimmen.

Der Service Worker behandelt eine Fassung als geschlossenes Paket: er lädt sie
vollständig in einen eigenen Cache und liefert ausschließlich von dort. Damit
läuft nie halb die alte und halb die neue App, und die Nummer unter *Mehr →
Über* stimmt mit dem, was tatsächlich läuft.

> **Vorsicht bei Weiterleitungen.** Cloudflare Pages normalisiert
> `/index.html` auf `/` und schickt dafür eine 308 (Firebase Hosting tut
> dasselbe mit einer 301). Eine Antwort, die über eine
> Weiterleitung kam, darf ein Service Worker für Seitenaufrufe nicht
> ausliefern — der Browser bricht sonst mit *„Response served by service worker
> has redirections"* ab, und die App startet gar nicht mehr. `sw.js` legt
> solche Antworten deshalb nur als bereinigte Kopie ab. Ein Gerät, auf dem noch
> eine kaputte Fassung liegt, repariert sich beim übernächsten Start von
> selbst: die neue Fassung erkennt den beschädigten Cache und übernimmt sofort,
> statt auf eine Zustimmung zu warten, die niemand mehr geben könnte.

Ohne Versionssprung ändert sich für die Nutzer nichts — auch dann nicht, wenn
die Dateien auf dem Server längst neu sind. Das ist Absicht: so entscheidet die
Versionsnummer, was ausgeliefert wird, und nicht der Zufall des Caches.

### Wie Nutzer das Update bekommen

Beim Start prüft die App, ob eine neue Fassung bereitliegt. Wenn ja, lädt der
Browser sie im Hintergrund komplett herunter — die alte läuft dabei unverändert
weiter. Erst danach fragt die App:

> **Update auf Version 1.2.0** — Die neue Fassung ist bereits heruntergeladen …
> *[Später]* *[Jetzt aktualisieren]*

*Jetzt aktualisieren* startet die App einmal neu; Einträge bleiben, weil sie in
`localStorage` bzw. Firestore liegen. *Später* lässt alles wie es ist — die
Frage kommt beim nächsten Start wieder, nicht aber noch einmal in derselben
Sitzung.

Weil das Paket zum Zeitpunkt der Frage schon vollständig auf dem Gerät liegt,
funktioniert das Aktualisieren auch ohne Empfang.

### Icons neu erzeugen

```sh
python3 tools/make-icons.py
```

### Firebase-SDK aktualisieren

```sh
npm run build:firebase        # oder: node tools/build-firebase.mjs 12.18.0
```

---

## Wo liegen die Daten?

Ohne Firebase: ausschließlich im Browser des Geräts (`localStorage`). Nichts
verlässt das Handy.

Mit Firebase: in eurem eigenen Firestore-Projekt. Es gibt keinen Server von
uns dazwischen, keine Konten, keine Auswertung. Über **Mehr → Sicherungskopie
speichern** kommt jederzeit alles als JSON-Datei heraus.

Cloudflare liefert nur die Dateien der App aus und bekommt von den Einträgen
nichts mit: die Geräte sprechen direkt mit Firestore, an Cloudflare vorbei.
