# Urlaubstracker

Ein persönlicher Urlaubsplaner für alle, die zusammen unterwegs sind — als
installierbare Web-App (PWA). Im Mittelpunkt steht die Tagesplanung: was
steht heute an, wo geht's hin, wann. Die gemeinsame Kasse gehört weiter
dazu, tritt aber eine Ebene zurück — sie rechnet im Hintergrund mit, wenn
ein Programmpunkt Geld kostet, wer eingezahlt hat und wer wem am Ende noch
was überweist.

Läuft offline, auf allen Geräten der Gruppe, ohne Abo.

## Funktionen

- **Heute** — der Tag als Timeline: Sehenswürdigkeiten, Essen, Aktivitäten
  mit Uhrzeit, Ort, Notiz und optionalen Kosten. Tage vor- und
  zurückblättern, Programmpunkte anlegen, bearbeiten, verschieben, abhaken.
- **Planung** — zwei Reiter in einem Bereich: „Tagesplanung“ (alle Reisetage
  auf einen Blick, mit Tagesfortschritt; ein Tipp auf die Datumszeile schlägt
  den Tag auf „Heute“ auf) und „Packliste“.
- **Packliste** — was mit muss, offline und ohne Datum: eintragen im
  Schnellfeld, danach nach Kategorie (Dokumente, Technik, Hygiene,
  Reiseapotheke, Schuhe, Ausflüge, Strand, Kleidung, Sonstiges), Stand (noch offen, noch zu kaufen,
  noch zu waschen, liegt bereit, eingepackt) und Gepäck (Hand- oder
  Aufgabegepäck) sortieren. Eigene Reiter für Handgepäck, Aufgabegepäck und
  „Zu tun“. Je Kategorie eine Sorte (T-Shirt, Lange Hose, Wanderschuhe …) und
  je Eintrag eine Anzahl — beides freiwillig und blass an der Zeile. Zwei
  Listen zur Wahl: die eigene, die nur der sieht, der sie angelegt hat, und
  die gemeinsame, die alle in der Reisegruppe sehen, abhaken und bearbeiten
  können — voreingestellt ist die gemeinsame.
- **Übersicht der Packliste** — ein eigener Reiter, der in Stücken zählt statt
  in Zeilen: „6 T-Shirts, 4 Hemden, 2 von 4 langen Hosen“, nach Kategorie und
  Sorte, umschaltbar zwischen Handgepäck, Aufgabegepäck und beidem.
- Ein Kostenpunkt am Programmpunkt wird sofort zur Vormerkung in der Kasse
  übernommen — dieselbe Vormerkung wie bei einer Ausgabe mit Zukunftsdatum.
- **Finanzen** — zwei Reiter in einem Bereich: „Ausgaben“ (nach Tagen, mit
  Kategorie-Filter) und „Kasse“ (Tagesbudget, Einzahlungen, Bargeld,
  Endabrechnung, Verlauf).
- **Mehr** — Reisegruppe, Sync, Sperre, Sicherung, Einstellungen.
- Eigene Zahlentastatur, Rückgängig, Ausgabe „nochmal“ eintragen.
- Reisegruppe mit 1–8 Personen, Kostenaufteilung frei einstellbar.
- Bezahlt von Kasse, privat oder bar — zählt in der Abrechnung richtig.
- Verplante (noch nicht bezahlte) Ausgaben, App-Sperre (Code/Biometrie).
- Mehrgeräte-Sync über Firebase, Beitritt mit Name + Passwort.
- Offline-fähig, Export als CSV/JSON, hell/dunkel.
- Alles, was lokal auf dem Gerät liegt, verschlüsselt (AES-256-GCM über die
  Web-Crypto-API, Details in [`js/secure-storage.js`](js/secure-storage.js)).

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

Weitere Härtung: **App Check** (siehe unten) gegen automatisiertes
Durchprobieren, *Mehr → Verbundene Geräte* zum Aussperren verlorener
Geräte, *Mehr → App-Sperre* für eine Codesperre auf dem Gerät selbst.

### App Check

`firestore.rules` regelt, *wer* auf eine Kasse zugreifen darf, und bleibt
das auch mit App Check — App Check ersetzt die Regeln nicht, sondern
bremst zusätzlich, *was* überhaupt bei Firestore und Authentication
ankommt: automatisiert gestellte Anfragen, zum Beispiel ein Skript, das
Passwörter gegen `join.js` durchprobiert, statt ein Browser mit dieser App.

Ohne Einrichtung läuft die Kasse unverändert weiter, nur eben ohne diese
Bremse — für den eigenen Familien- und Freundeskreis mag das reichen. Für
jede Auslieferung, die öffentlich erreichbar ist, sind aber **beide**
Schritte unten nötig; der erste allein bremst noch nichts:

1. **Nachweis einrichten** (in der Web-App: reCAPTCHA Enterprise, siehe
   [Firebase-Dokumentation, „App Check mit reCAPTCHA
   Enterprise“](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) —
   die von Firebase für neue Einrichtungen empfohlene Variante; sie läuft
   über ein Google-Cloud-Projekt, nicht über die klassische
   `g.co/recaptcha/admin`-Konsole):
   - In der [Google-Cloud-Konsole unter reCAPTCHA
     Enterprise](https://console.cloud.google.com/security/recaptcha) einen
     Websiteschlüssel anlegen, die eigene(n) Domain(s) eintragen. Der
     **Websiteschlüssel** aus diesem Schritt ist `appCheckSiteKey`.
   - In der Firebase-Konsole unter **App Check** die Web-App registrieren,
     Anbieter **reCAPTCHA Enterprise** wählen und denselben Websiteschlüssel
     eintragen.
   - Den Schlüssel als `appCheckSiteKey` in `firebase-config.json`
     eintragen (siehe [`firebase-config.example.json`](firebase-config.example.json))
     oder bei Cloudflare Pages als `FIREBASE_APPCHECK_SITE_KEY` setzen
     (siehe unten, „Veröffentlichen”). **Wichtig:** der Anbieter in der
     Firebase-Konsole und im Code müssen zusammenpassen — ist dort
     Enterprise registriert, aber der Websiteschlüssel eines *klassischen*
     reCAPTCHA-v3-Schlüssels eingetragen (oder umgekehrt), scheitert jeder
     Nachweis, ohne dass die App das erkennen kann; die Firebase-Konsole
     unter App Check → API zeigt das dann als durchgehend 0 % bestätigte
     Anfragen.
2. **Erzwingen** — ohne diesen Schritt akzeptiert Firebase Anfragen auch
   ohne gültigen Nachweis weiterhin, der Schlüssel allein bewirkt also noch
   nichts:
   - Firebase-Konsole → **App Check** → **APIs** → bei **Cloud Firestore**
     und bei **Authentication** jeweils **Erzwingen** einschalten.
   - Das lohnt sich erst, nachdem echte Geräte erfolgreich mit App Check
     verbunden waren (Konsole zeigt „gültige Anfragen“ pro API) — sonst
     sperrt „Erzwingen“ die eigenen Geräte mit aus.

Ohne Schritt 2 bleibt die Kasse technisch ungeschützt gegen automatisiertes
Durchprobieren, auch wenn `appCheckSiteKey` gesetzt ist — Firebase warnt
davor nicht von sich aus, die App aber schon: fehlt der Schlüssel auf einem
Gerät, das nicht `localhost` ist, steht eine Warnung in der
Browser-Konsole.

### Konten und Wegwerf-Adressen

Eine Kasse allein auf einem Gerät braucht kein Konto — dort verlässt kein
Eintrag den Browser. Sobald eine Kasse geteilt wird, braucht es eines, mit
bestätigter E-Mail-Adresse. Nur so lässt sich beides durchsetzen, was die
Kasse vor automatisiertem Durchprobieren schützt; eine Prüfung in der
Oberfläche umgeht, wer die Oberfläche weglässt.

Damit die Sperre gegen Wegwerf-Postfächer greift, muss die Domainliste
**einmal nach Firestore geschrieben werden**. Ohne diesen Schritt ist sie
verdrahtet, aber wirkungslos: `exists()` findet nichts, also gilt jede
Adresse als in Ordnung (die E-Mail-Bestätigung wirkt unabhängig davon).

Die Liste liegt als [`tools/disposable-email-blocklist.conf`](tools/disposable-email-blocklist.conf)
im Repo — aus [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
(CC0). Ausgeliefert wird sie nicht; sie ist Werkzeug, kein Teil der App.
Gelesen wird zur Laufzeit Firestore, von beiden Seiten: vom
Registrierungsformular für die sofortige Rückmeldung und von den
Sicherheitsregeln für die tatsächliche Durchsetzung. Zwei getrennte Listen
wären früher oder später zwei verschiedene.

In der [Google Cloud Shell](https://console.cloud.google.com/) — dort ist die
Anmeldung schon da, es braucht keinen Dienstkonto-Schlüssel:

```sh
npm i --no-save firebase-admin    # nicht Teil der App
node tools/seed-blocklist.mjs
```

Rund 8.700 Dokumente in Stapeln zu 500. Der Lauf ist wiederholbar; `--prune`
räumt zusätzlich weg, was aus der Quelle verschwunden ist. Auf einem eigenen
Rechner braucht es Zugangsdaten eines Dienstkontos mit Firestore-Schreibrecht
(`GOOGLE_APPLICATION_CREDENTIALS`) und `--project=…`.

**Entwicklung:** App Check lässt sich auf `localhost`/`127.0.0.1` mit einem
Debug-Token statt einem echten reCAPTCHA-Nachweis testen. Dazu in der
Firebase-Konsole unter App Check → App Check-Debug-Tokens einen Token
anlegen und ihn als `appCheckDebugToken` in einer lokalen
`firebase-config.json` eintragen — die App liest dieses Feld nur auf einem
lokalen Entwicklungsgerät, auf jedem anderen Host bleibt es wirkungslos.
Dieses Feld gehört nie in eine `firebase-config.json`, die tatsächlich
ausgeliefert wird, und `write-firebase-config.mjs` (Cloudflare-Build) kennt
es entsprechend gar nicht erst.

## Veröffentlichen (Cloudflare Pages)

Push auf `main` baut und veröffentlicht automatisch. Einrichtung:
Build command `npm run build`, Build output directory `/`. Firebase-Werte
optional als Environment Variables (`FIREBASE_API_KEY`,
`FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, …) —
`npm run build` schreibt daraus `firebase-config.json`. Für eine öffentlich
erreichbare Auslieferung gehört `FIREBASE_APPCHECK_SITE_KEY` dazu, siehe
oben, Abschnitt „App Check“ — inklusive „Erzwingen“ in der
Firebase-Konsole, das lässt sich nicht per Environment Variable setzen.

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
              secure-storage.js (Verschlüsselung), prefs.js, privacy.js,
              join.js, lock.js, trash.js, link.js, ui/, views/
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
