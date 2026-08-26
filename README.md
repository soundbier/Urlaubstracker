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

Die App sagt dann konkret: *„Vom Konto zurück: Marie 682,30 €, Lukas 582,30 €“*
oder *„Marie überweist 50,00 € an Lukas.“*

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
npm test      # Tests der Rechenlogik (node --test, ohne Abhängigkeiten)
npm start     # lokaler Server auf http://localhost:8080
```

Es gibt keinen Build-Schritt: der Browser lädt die ES-Module direkt. Nach
Änderungen an Dateien, die der Service Worker vorhält, `CACHE_VERSION` in
[`sw.js`](sw.js) hochzählen.

### Aufbau

```
index.html            App-Hülle
styles.css            komplettes Stylesheet, hell und dunkel
sw.js                 Service Worker (Offline-Betrieb)
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

tests/calc.test.js    Tests der Rechenlogik
tools/                Icon-Generator, Dev-Server, Firebase-Bündelung
vendor/firebase.js    gebündeltes Firebase-SDK (kein CDN nötig)
```

Beträge liegen überall als **ganzzahlige Cent** vor, Datumsangaben als
`YYYY-MM-DD` und werden als Kalendertage behandelt — nicht als Zeitpunkte.
Deshalb stimmt die Rechnung auch über die Zeitumstellung hinweg.

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
