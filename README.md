# Urlaubstracker

Eine gemeinsame Urlaubskasse für zwei — als installierbare Web-App (PWA).

Ihr tragt ein, was jede:r aufs gemeinsame Konto überwiesen hat. Daraus rechnet
die App aus, wie viel pro Tag drin ist. Unterwegs hakt ihr in ein paar Sekunden
ab, was ihr ausgegeben habt, und seht auf einen Blick, was heute noch übrig ist.
Am Ende steht die Abrechnung: wer wem noch was überweist.

Läuft offline, auf beiden Handys, ohne Abo.

---

## Was drin ist

| Bereich | Was ihr dort tut |
| --- | --- |
| **Heute** | Eine große Zahl: was heute noch übrig ist. Darunter die Einträge des Tages. |
| **Ausgaben** | Alles nach Tagen gruppiert, mit Filter nach Kategorie. Antippen zum Ändern. |
| **Budget** | Einzahlungen, Verlauf über den Urlaub, Aufteilung nach Kategorie, Endabrechnung. |
| **Mehr** | Zeitraum, Währung, Namen, Kostenaufteilung, Synchronisierung, Export. |

Weitere Kleinigkeiten:

- **Eigene Zahlentastatur** — große Tasten, eine Komma-Taste, keine Systemtastatur,
  die das halbe Sheet verdeckt.
- **Bezahlt von** — aus der gemeinsamen Kasse oder aus eigener Tasche. Beides
  zählt in der Endabrechnung richtig.
- **Offline** — die App startet ohne Netz, Eingaben werden nachgereicht.
- **Export** — CSV für Excel, JSON als Sicherungskopie.

---

## Wie das Tagesbudget gerechnet wird

Es gibt zwei Modi (umstellbar unter *Mehr → Tagesbudget*):

**Mitwachsend** (Standard)

```
Tagesbudget heute = (Gesamtbudget − alles vor heute Ausgegebene) ÷ verbleibende Tage
```

Jeden Morgen neu gerechnet. Ein teurer Tag baut keine Schuld auf, er verteilt
sich still auf den Rest. Das ist der entspannte Modus: ihr müsst nichts
„aufholen“.

**Fester Satz**

```
Tagesbudget = Gesamtbudget ÷ Urlaubstage
```

Jeden Tag derselbe Betrag. Ob ihr insgesamt vor oder hinter dem Plan liegt,
zeigt die Kachel **Polster**.

Wichtig: Das Tagesbudget wird immer aus dem Stand von *heute früh* gerechnet.
Sonst würde die Zahl beim Eintragen einer Ausgabe unter den Fingern schrumpfen.

### Endabrechnung

Getragen hat jede Person, was sie **eingezahlt** hat plus was sie **aus eigener
Tasche** bezahlt hat. Fair wäre ihr Anteil an den Gesamtausgaben (Standard
50/50, unter *Mehr → Kosten aufteilen* änderbar). Die Differenz ist ihr
Guthaben — und die Summe aller Guthaben ist genau das, was noch auf dem
gemeinsamen Konto liegt.

Daraus wird eine Liste von Überweisungen: erst geht das Restgeld vom Konto an
die Guthaben zurück, was dann noch offen ist, überweist man sich direkt.

Ist vom Konto mehr abgegangen, als eingezahlt wurde, steht es im Minus — dann
dreht sich der erste Schritt um: die Liste sagt, wer wie viel **nachzahlt**,
bis das Konto wieder auf null ist.

---

## Loslegen

Die App öffnen — fertig. Beim ersten Start legt ihr den Urlaub an (Name,
Zeitraum, eure Namen). Sie läuft dann erst mal nur auf diesem Gerät.

### Auf dem Handy installieren

- **Android/Chrome:** Menü → *Zum Startbildschirm hinzufügen* (oder der
  Installationshinweis, der von selbst auftaucht).
- **iPhone/Safari:** Teilen-Symbol → *Zum Home-Bildschirm*.

Danach startet sie wie eine normale App, im Vollbild und ohne Adresszeile.

---

## Zu zweit nutzen (Firebase Firestore)

Damit beide Handys denselben Stand sehen, braucht es einmalig ein kostenloses
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
„Kein Zugriff auf diesen Trip“.

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
   *Verbinden und hochladen*. Der bestehende Trip wandert mitsamt allen
   Einträgen in die Cloud.

### 4. Das zweite Handy dazuholen

**Mehr → Einladung teilen.** Der Link enthält alles, was das andere Gerät
braucht — einfach per Nachricht schicken. Ein Tipp darauf, *Beitreten*, fertig.

> Der Link ist der Schlüssel zum Trip. Er gehört in einen privaten Chat, nicht
> in eine öffentliche Gruppe. Falls er doch mal irgendwo landet:
> **Mehr → Einladungscode erneuern** macht alte Links unbrauchbar.
>
> Die Firebase-Konfiguration im Link ist übrigens kein Geheimnis — sie steht bei
> jeder Web-App im Quelltext. Geschützt wird der Trip über die Sicherheitsregeln
> und den Einladungscode.

---

## Veröffentlichen

Eine PWA braucht HTTPS. Zwei Wege, beide kostenlos:

### GitHub Pages

Ist schon eingerichtet: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
testet bei jedem Push und veröffentlicht `main`. Einmalig in den
Repository-Einstellungen unter *Pages* als Quelle **GitHub Actions** wählen.

### Firebase Hosting

Wenn ohnehin ein Firebase-Projekt da ist:

```sh
npx firebase-tools login
npx firebase-tools use --add        # das eigene Projekt auswählen
npx firebase-tools deploy --only hosting,firestore:rules
```

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
styles.css            komplettes Stylesheet, hell und dunkel
sw.js                 Service Worker: Offline-Betrieb und Update-Steuerung
manifest.webmanifest  Installation als App

js/
  app.js              Kopfzeile, Navigation, Schnelleingabe
  calc.js             die gesamte Rechenlogik, ohne DOM — hier sitzt die Wahrheit
  store.js            Zustand und Schreibvorgänge
  backend-local.js    Speicherung im Gerät
  backend-firestore.js  Synchronisierung zu zweit
  prefs.js            geräteeigene Einstellungen
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

> **Vorsicht bei Weiterleitungen.** Firebase Hosting normalisiert
> `/index.html` auf `/` und schickt dafür eine 301. Eine Antwort, die über eine
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
