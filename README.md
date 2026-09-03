# Urlaubstracker

Eine gemeinsame Urlaubskasse für alle, die zusammen unterwegs sind — als
installierbare Web-App (PWA). Ihr tragt ein, was jede:r eingezahlt hat,
die App rechnet das Tagesbudget aus, ihr hakt Ausgaben ab, am Ende steht
die Abrechnung: wer wem noch was überweist.

Läuft offline, auf allen Geräten der Gruppe, ohne Abo.

## Funktionen

- **Heute / Ausgaben / Budget / Mehr** — Tagesbudget auf einen Blick,
  Ausgaben nach Tagen, Einzahlungen & Endabrechnung, Einstellungen.
- Eigene Zahlentastatur, Rückgängig, Ausgabe „nochmal“ eintragen.
- Reisegruppe mit 1–8 Personen, Kostenaufteilung frei einstellbar.
- Bezahlt von Kasse, privat oder bar — zählt in der Abrechnung richtig.
- Verplante (noch nicht bezahlte) Ausgaben, App-Sperre (Code/Biometrie).
- Mehrgeräte-Sync über Firebase, Beitritt mit Name + Passwort.
- Offline-fähig, Export als CSV/JSON, hell/dunkel.

Details zur Tagesbudget-Berechnung stehen in [`js/calc.js`](js/calc.js).

## Loslegen

App öffnen, Urlaub anlegen (Name, Zeitraum, Reisegruppe) — läuft dann
lokal auf einem Gerät. Installierbar über den Browser (Android: *Zum
Startbildschirm hinzufügen*, iOS: *Teilen → Zum Home-Bildschirm*).

## Gemeinsam nutzen (Firebase)

Für Mehrgeräte-Sync braucht es ein kostenloses Firebase-Projekt:

1. Projekt anlegen, **Firestore** (Produktionsmodus, EU-Region) und
   **Authentication → Anonym** aktivieren.
2. [`firestore.rules`](firestore.rules) veröffentlichen:
   `npx firebase-tools deploy --only firestore:rules`
3. Web-App in der Firebase-Konsole anlegen, Konfiguration in der App unter
   *Mehr → Mit Firebase verbinden* einfügen (oder als
   [`firebase-config.json`](firebase-config.example.json) neben
   `index.html` ablegen — bei Cloudflare Pages per Environment Variables,
   siehe unten).
4. Andere Geräte treten über *Einer bestehenden Kasse beitreten* mit Name
   und Passwort bei.

Weitere Härtung: **App Check** (reCAPTCHA v3) gegen automatisiertes
Durchprobieren, *Mehr → Verbundene Geräte* zum Aussperren verlorener
Geräte, *Mehr → App-Sperre* für eine Codesperre auf dem Gerät selbst.

## Veröffentlichen (Cloudflare Pages)

Push auf `main` baut und veröffentlicht automatisch. Einrichtung:
Build command `npm run build`, Build output directory `/`. Firebase-Werte
optional als Environment Variables (`FIREBASE_API_KEY`,
`FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, …) —
`npm run build` schreibt daraus `firebase-config.json`.

Firestore-Regeln werden separat veröffentlicht (siehe oben), nicht über
Cloudflare.

## Entwickeln

```sh
npm test      # Tests (node --test, läuft ohne npm install)
npm start     # lokaler Server auf http://localhost:8080
```

Kein Build-Schritt: der Browser lädt die ES-Module direkt.
`npm ci` braucht nur, wer `vendor/firebase.js` neu bauen will.

```
index.html    App-Hülle
styles.css    Stylesheet
sw.js         Service Worker (Offline, Update-Steuerung)
js/           app.js, calc.js (Rechenlogik), store.js, backend-*.js,
              prefs.js, privacy.js, join.js, lock.js, trash.js, link.js,
              ui/, views/
tests/        Tests
tools/        Icon-Generator, Dev-Server, Firebase-Bündelung
vendor/       gebündeltes Firebase-SDK
```

Neue Fassung veröffentlichen: `APP_VERSION` in [`sw.js`](sw.js) hochzählen
und `data-version` in `index.html` sowie `version` in `package.json`
mitziehen — `npm test` prüft, dass alle drei übereinstimmen. Der Service
Worker lädt jede Fassung vollständig, bevor Nutzer per Dialog aktualisieren
können.

Abhängigkeiten: `vendor/firebase.js` ist fest an eine Version gepinnt
(`package.json`, `vendor/firebase.lock.json`). Nach einem Update:

```sh
npm ci
npm run build:firebase
npm test
```

## Datenschutz

Ohne Firebase bleiben alle Daten im Browser des Geräts. Mit Firebase
liegen sie im eigenen Firestore-Projekt der Gruppe — kein eigener Server,
kein Tracking. Details (Verantwortlicher, Speicherort, Aufbewahrung)
zeigt die App unter *Mehr → Datenschutz*.
