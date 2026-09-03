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
- **Bezahlt von** — aus der gemeinsamen Kasse, aus eigener Tasche oder aus
  Bargeld. Alle drei zählen in der Endabrechnung richtig. Wer mehrmals
  hintereinander privat zahlt, stellt das nur einmal um: die Wahl bleibt bis
  zum nächsten App-Start stehen und steht immer sichtbar in der Detailzeile.
- **Bargeld** — nehmt ihr Geld aus der Kasse in bar mit, tragt ihr unter
  *Budget → Bargeld* ein, wer wie viel bekommen hat. Bar bezahlte Ausgaben
  ziehen das anschließend automatisch von dieser Person ab — anders als
  privat vorgestreckt ist das Geld ja schon der Kasse, es steckt nur gerade
  in der Tasche statt auf dem Konto.
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
- **Person entfernen**, solange kein Geld an ihr hängt. Sobald sie eingezahlt,
  etwas privat bezahlt oder Bargeld erhalten bzw. bar bezahlt hat, bleibt sie
  drin — sonst stünde in der Abrechnung eine Einzahlung ohne Einzahler.
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

Bar bezahlt zählt dabei wie aus der Kasse bezahlt, nicht wie privat
vorgestreckt — das Geld war ja schon der Kasse ihres. Wer noch Bargeld übrig
hat, steht deshalb als eigener Hinweis in der Abrechnung: das muss erst
zurück in die Kasse, bevor die Beträge oben wirklich stimmen.

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
   Als Modus *Produktion* wählen und eine **EU-Region** setzen, etwa
   `eur3 (europe-west)`. Die Region lässt sich später nicht mehr ändern, und
   außerhalb der EU ist jede Eingabe eine Drittlandübermittlung — die App
   fragt beim Teilen danach und warnt dann sichtbar (siehe
   [Wo liegen die Daten?](#wo-liegen-die-daten-datenschutz)).
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
Beitreten wirklich nur Name und Passwort —, muss die App unter
`./firebase-config.json` eine Datei mit diesem Block finden (siehe
[`firebase-config.example.json`](firebase-config.example.json) als Vorlage).
Die Werte sind kein Geheimnis: dieselben Angaben stehen bei jeder Web-App im
Quelltext. Geschützt wird die Kasse über die Sicherheitsregeln und das
Passwort — trotzdem muss die Datei nicht im Git-Repository liegen, dazu gleich
mehr bei Cloudflare Pages. Ohne die Datei geht alles wie bisher — dann bringt
entweder der Einladungslink die Konfiguration mit, oder sie kommt einmal von
Hand über *Mehr → Mit Firebase verbinden* ins Gerät.

- **Deployt ihr über Cloudflare Pages** (siehe unten): die Werte kommen aus
  *Settings → Environment variables* und werden beim Bauen in die Datei
  geschrieben. Landen nie im Repository.
- **Andere Hoster / lokal ausprobieren:** die Datei von Hand neben `index.html`
  legen und committen —
  ```sh
  cp firebase-config.example.json firebase-config.json   # Werte eintragen, committen
  ```
  Das ist unbedenklich, weil die Werte ohnehin kein Geheimnis sind — nur eben
  auch für alle sichtbar, die das Repository einsehen können.

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
  Sicherheitsregeln vergleichen. Neu vergeben (beim Anlegen, beim Ändern, beim
  erstmaligen Teilen) braucht es mindestens zehn Zeichen und darf nicht auf der
  Liste der naheliegendsten Passwörter stehen — ein bestehendes, kürzeres
  Passwort funktioniert zum Beitreten weiterhin.
- **Mehr → Beitrittsdaten → Passwort ändern** sperrt alle aus, die es noch nicht
  benutzt haben. Wer schon dabei ist, bleibt dabei.
- Der **Einladungslink** gibt es weiterhin (*Beitrittsdaten → Stattdessen
  Einladungslink*). Er ist der bequemste Weg für Geräte, die das
  Firebase-Projekt noch nicht kennen — er bringt die Konfiguration mit.

> Name und Passwort sind zusammen der Schlüssel zur Kasse. Sie gehören in einen
> privaten Chat oder ins Gespräch, nicht in eine öffentliche Gruppe.

### 5. Automatisiertes Ausprobieren erschweren (App Check)

Der Name einer Kasse ergibt über eine feste Rechenvorschrift ihre Kennung in
Firestore (siehe [`js/join.js`](js/join.js)) — praktisch beim Beitreten, aber
es heißt auch: wer den Namen kennt oder errät, kann Passwörter dagegen
offline durchprobieren und die Nachweise beliebig oft gegen die Kasse testen.
Firestore selbst bremst das nicht; ein langes, neu vergebenes Passwort (siehe
oben) macht Erfolg unwahrscheinlich, verhindert das Durchprobieren aber nicht.

**Firebase App Check** schiebt davor eine zusätzliche Prüfung ein: Firestore
nimmt dann nur noch Anfragen an, die zusätzlich zum Nachweis ein Ticket von
Google reCAPTCHA v3 mitbringen — ein Ticket bekommt nur, wer die Seite
tatsächlich im Browser lädt, kein Skript, das nur Passwörter durchprobiert.

1. In der Firebase-Konsole: **Build → App Check**, die Web-App auswählen und
   als Anbieter **reCAPTCHA v3** registrieren. Firebase zeigt dabei einen
   **Site-Schlüssel** (beginnt meist mit `6L…`).
2. Diesen Schlüssel als `appCheckSiteKey` in die Firebase-Konfiguration
   aufnehmen — im eingefügten Block, in `firebase-config.json` (siehe
   [`firebase-config.example.json`](firebase-config.example.json)) oder bei
   Cloudflare Pages als Variable `FIREBASE_APPCHECK_SITE_KEY`.
3. Ein paar Tage im Modus **Überwachen** laufen lassen (App Check zeigt dort,
   wie viele Anfragen ein gültiges Ticket hätten) und erst danach in der
   Konsole auf **Erzwingen** stellen — für **Firestore Database** und, wer
   mag, zusätzlich für **Authentication**. Vor „Erzwingen“ sollten alle
   Geräte der Gruppe einmal die neue Fassung geladen haben, sonst hängen sie
   kurzzeitig ohne Zugriff da.

Ohne diesen Schritt läuft alles wie gehabt — er ist eine zusätzliche Bremse,
keine Voraussetzung. Wichtig beim lokalen Entwickeln (`npm start`,
`localhost`): reCAPTCHA v3 muss die Domain kennen, unter der es läuft; dafür
in der reCAPTCHA-Administration von Google `localhost` bei den erlaubten
Domains eintragen, oder App Check dort im Debug-Modus laufen lassen.

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
| Build command | `npm run build` |
| Build output directory | `/` |

Es gibt keinen Build-Schritt im üblichen Sinn — der Browser lädt die
ES-Module direkt, das Ausgabeverzeichnis ist deshalb die Wurzel. `npm run
build` macht zwei Dinge: [`tools/write-firebase-config.mjs`](tools/write-firebase-config.mjs)
schreibt `firebase-config.json` aus Umgebungsvariablen (dazu gleich mehr),
danach läuft `npm test` als Bremse — schlägt ein Test fehl, bricht Cloudflare
ab und die bisherige Fassung bleibt online.

Ausgeliefert wird damit auch, was nur zur Entwicklung gehört (`tests/`,
`tools/`, `package.json`). Das ist harmlos — es steht ohnehin öffentlich auf
GitHub.

#### Firebase-Konfiguration ohne Git

Damit zum Beitreten wirklich nur Name und Passwort reichen (siehe oben,
*Gemeinsam nutzen*), ohne die Firebase-Werte im öffentlichen Repository zu
haben: unter *Workers & Pages → Projekt → Settings → Environment variables*
diese Variablen für *Production* eintragen (Werte aus der Firebase-Konsole,
*Projekteinstellungen → Meine Apps → Web-App* — als **Secret** anlegen, dann
stehen sie nicht einmal im Cloudflare-Dashboard offen im Klartext):

| Variable | Pflicht |
| --- | --- |
| `FIREBASE_API_KEY` | ja |
| `FIREBASE_AUTH_DOMAIN` | ja |
| `FIREBASE_PROJECT_ID` | ja |
| `FIREBASE_APP_ID` | ja |
| `FIREBASE_STORAGE_BUCKET` | nein |
| `FIREBASE_MESSAGING_SENDER_ID` | nein |
| `FIREBASE_APPCHECK_SITE_KEY` | nein, siehe *App Check* oben |

`write-firebase-config.mjs` schreibt daraus bei jedem Build
`firebase-config.json` neu — die Datei landet nie im Git-Repository (sie
steht in `.gitignore`) und existiert nur in der jeweiligen Cloudflare-Fassung.
Sind keine dieser Variablen gesetzt, überspringt das Skript den Schritt
kommentarlos und alles bleibt beim alten Weg (Einladungslink oder *Mehr → Mit
Firebase verbinden*). Sind nur einige der Pflichtfelder gesetzt, bricht der
Build ab — das ist dann eine unvollständige Einrichtung, kein Normalfall.

### Kopfzeilen

[`_headers`](_headers) sorgt dafür, dass `sw.js`, die App-Hülle und das
Manifest nicht aus einem Zwischenspeicher kommen. Ohne das könnte Cloudflare
eine alte `sw.js` ausliefern — und dann bemerkt niemand, dass es eine neue
Fassung gibt.

Für alle Pfade (`/*`) stehen dort außerdem Sicherheits-Kopfzeilen: eine
Content-Security-Policy (erlaubt eigene Dateien, das eine Inline-Skript in
`index.html` per Hash, sowie Firebase/Firestore und — nur falls eingerichtet —
reCAPTCHA für App Check), dazu Strict-Transport-Security,
X-Content-Type-Options, Referrer-Policy und Permissions-Policy. Bekannt ist
aktuell kein Angriffsweg dagegen (`js/dom.js` setzt bewusst nirgends
`innerHTML` mit fremdem Text) — das hier ist die zweite Verteidigungslinie,
falls sich das einmal ändert. Wer eine eigene Firebase-Konfiguration per Hand
einträgt statt über `firebase-config.json`, ist von der CSP nicht betroffen:
Firestore und Auth laufen über `https://*.googleapis.com`, unabhängig vom
Projekt.

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
firebase-config.example.json  Vorlage für firebase-config.json (von Hand kopiert
                      oder von tools/write-firebase-config.mjs erzeugt) — dann
                      kennt jedes Gerät das Firebase-Projekt der Gruppe

js/
  app.js              Kopfzeile, Navigation, Schnelleingabe
  calc.js             die gesamte Rechenlogik, ohne DOM — hier sitzt die Wahrheit
  store.js            Zustand und Schreibvorgänge
  backend-local.js    Speicherung im Gerät
  backend-firestore.js  Synchronisierung über mehrere Geräte
  prefs.js            geräteeigene Einstellungen (auch hell/dunkel)
  privacy.js          Datenschutz: Speicherorte, Aufbewahrungsfrist, Art.-13-Text
  join.js             Name + Passwort → Kennung und Nachweis der Kasse
  link.js             Einladungslinks, CSV- und JSON-Export
  dom.js  format.js   kleine Helfer
  ui/                 Sheets, Zahlentastatur, wiederkehrende Bausteine
  views/              die vier Bereiche plus Ersteinrichtung

tests/                Rechenlogik, Im-/Export, Release-Invarianten
tools/                Icon-Generator, Dev-Server, Firebase-Bündelung, firebase-config.json aus Env-Variablen
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

## Wo liegen die Daten? (Datenschutz)

Ohne Firebase: ausschließlich im Browser des Geräts (`localStorage` und
IndexedDB). Nichts verlässt das Handy.

Mit Firebase: in eurem eigenen Firestore-Projekt. Es gibt keinen Server von
uns dazwischen, keine Konten, keine Auswertung, keine Werbung, kein Tracking.
Über **Mehr → Sicherungskopie speichern** kommt jederzeit alles als
JSON-Datei heraus.

Cloudflare liefert nur die Dateien der App aus und bekommt von den Einträgen
nichts mit: die Geräte sprechen direkt mit Firestore, an Cloudflare vorbei.

In der App steht dasselbe noch einmal für die Reisegruppe: **Mehr →
Datenschutz** zeigt die Angaben nach Art. 13 DSGVO, den Speicherort und die
Aufbewahrungsfrist; erreichbar ist der Text auch vom ersten Bildschirm aus,
also bevor überhaupt ein Name eingetippt ist.

### Wann die DSGVO überhaupt greift

Führt ihr die Kasse im Kreis der eigenen Familie oder Freunde, greift die
**Haushaltsausnahme** (Art. 2 Abs. 2 lit. c DSGVO): Dann sind die Pflichten
unten für euch gegenstandslos. Sobald jemand diese Seite aber für wechselnde
oder größere Gruppen bereitstellt — Vereinsfahrt, Firmenausflug, öffentlich
erreichbare Installation —, endet die Ausnahme, und die folgenden Punkte
gelten.

### Verantwortlicher und Auftragsverarbeiter

**Verantwortlicher** (Art. 4 Nr. 7 DSGVO) ist, wer die Seite bereitstellt und
das Firebase-Projekt betreibt — nicht dieses Repository und nicht die
Reisegruppe. Wer das ist, weiß nur ihr selbst, deshalb kennt die App dafür ein
Feld: `privacyContact` in `firebase-config.json` (bei Cloudflare Pages die
Umgebungsvariable `FIREBASE_PRIVACY_CONTACT`). Was dort steht — Name,
Anschrift, E-Mail —, zeigt die App unter *Mehr → Datenschutz*. Bleibt das Feld
leer, sagt sie ehrlich, dass die Stelle noch auszufüllen ist.

**Auftragsverarbeiter** (Art. 28 DSGVO) ist Google (Firebase/Firestore). Der
Auftragsverarbeitungsvertrag steckt im *Cloud Data Processing Addendum* der
Google-Cloud-Bedingungen; er muss im Firebase-Projekt aktiv akzeptiert und
dokumentiert werden (Google-Cloud-Konsole → *Privacy & Security → Data
processing terms*). Weitere Empfänger gibt es nicht.

### Speicherort: EU-Region

Die Region der Firestore-Datenbank wird **beim Anlegen** festgelegt und lässt
sich danach nicht mehr ändern — empfohlen ist `eur3 (europe-west)` oder eine
andere `europe-*`-Region. Aus der Firebase-Konfiguration geht die Region nicht
hervor, die App kann sie also nicht selbst auslesen; stattdessen fragt sie beim
Teilen danach und warnt sichtbar, wenn die Wahl außerhalb der EU liegt
(Drittlandübermittlung, Art. 44 ff. DSGVO). Die Angabe steht danach am Trip und
gilt für alle Geräte; unter *Mehr → Speicherort der Daten* lässt sie sich
korrigieren. Voreinstellen könnt ihr sie über `dataRegion` in
`firebase-config.json` bzw. `FIREBASE_DATA_REGION`.

Liegt eine bestehende Datenbank in den USA, hilft nur ein neues Firestore mit
EU-Region und ein Umzug über *Sicherungskopie speichern → einspielen*.

### Aufbewahrung und Löschung

Automatisch gelöscht wird nichts — das würde eine laufende Kasse mitten im
Urlaub leerräumen. Stattdessen gilt die Regel: **spätestens 42 Tage nach dem
letzten Urlaubstag löschen** (Speicherbegrenzung, Art. 5 Abs. 1 lit. e DSGVO).
Bis dahin sind Abrechnung und Rückzahlungen durch. Die App erinnert nach Ablauf
der Frist unter *Mehr → Aufbewahrung* daran und bietet dort den Weg zum
Löschen; die Frist steht als `RETENTION_DAYS` in `js/privacy.js`.

*Mehr → Urlaubskasse löschen* entfernt den Trip samt allen Einträgen — im
geteilten Betrieb für alle Geräte. Betroffenenrechte (Art. 15–21 DSGVO) decken
die vorhandenen Funktionen ab: Auskunft und Datenübertragbarkeit über *Als CSV*
bzw. *Sicherungskopie speichern*, Berichtigung über das Bearbeiten jedes
Eintrags, Löschung über die beiden Wege oben.
