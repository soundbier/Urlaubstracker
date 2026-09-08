# Setup

Diese Anleitung beschreibt die Einrichtung des Urlaubstrackers mit Firebase und Cloudflare Pages.

## 1. Firebase-Projekt erstellen

In der [Firebase Console](https://console.firebase.google.com/) ein neues Projekt erstellen.

Anschließend:

### Authentication

Unter **Build → Authentication → Sign-in method**:

* **Anonymous** aktivieren

### Firestore

Unter **Build → Firestore Database**:

* Datenbank erstellen
* **Produktionsmodus** auswählen
* möglichst eine **EU-Region** verwenden

## 2. Firestore-Regeln veröffentlichen

Firebase CLI installieren bzw. verwenden:

```bash
npx firebase-tools login
```

Danach im Repository:

```bash
npx firebase-tools deploy --only firestore:rules
```

Die verwendeten Regeln befinden sich in:

```text
firestore.rules
```

Die Regeln sind weiterhin die eigentliche Zugriffskontrolle. App Check ersetzt sie nicht.

## 3. Firebase Web-App

In Firebase unter:

**Project settings → Your apps → Web-App hinzufügen**

Die angezeigte Firebase-Konfiguration wird benötigt.

Für lokale Entwicklung kann eine Datei

```text
firebase-config.json
```

neben `index.html` angelegt werden.

Als Vorlage dient:

```text
firebase-config.example.json
```

Beispiel:

```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "appId": "YOUR_APP_ID"
}
```

Die Datei mit echten Zugangsdaten gehört **nicht ins Repository**.

## 4. App Check einrichten

Für eine öffentlich erreichbare Installation sollte Firebase App Check aktiviert werden.

Der Urlaubstracker verwendet dafür **reCAPTCHA Enterprise**.

### Websiteschlüssel erstellen

In der Google-Cloud-Konsole unter **reCAPTCHA Enterprise** einen Websiteschlüssel für die verwendeten Domains erstellen.

Der Schlüssel wird als:

```text
appCheckSiteKey
```

verwendet.

### In Firebase registrieren

In Firebase:

**App Check → Apps → Web-App**

Als Anbieter **reCAPTCHA Enterprise** auswählen und denselben Websiteschlüssel hinterlegen.

### Schlüssel in der App

Lokal:

```json
{
  "appCheckSiteKey": "YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY"
}
```

Bei Cloudflare Pages wird stattdessen die Environment Variable verwendet:

```text
FIREBASE_APPCHECK_SITE_KEY
```

### Enforcement aktivieren

Erst nachdem echte Geräte erfolgreich validiert wurden:

**Firebase → App Check → APIs**

für folgende Dienste **Erzwingen** aktivieren:

* Cloud Firestore
* Authentication

App Check verhindert nicht den Zugriff durch einen berechtigten Nutzer. Es erschwert insbesondere automatisierte Anfragen und Missbrauch der öffentlichen Firebase-Endpunkte.

## 5. Lokale Entwicklung

Tests:

```bash
npm test
```

Lokaler Server:

```bash
npm start
```

Danach:

```text
http://localhost:8080
```

Für die lokale Entwicklung kann ein App-Check-Debug-Token verwendet werden.

Das Feld

```text
appCheckDebugToken
```

darf **nur in der lokalen Konfiguration** verwendet werden und niemals mit der produktiven App ausgeliefert werden.

## 6. Cloudflare Pages

Repository mit Cloudflare Pages verbinden.

### Build-Konfiguration

```text
Build command: npm run build
Build output directory: /
```

Die Veröffentlichung erfolgt anschließend automatisch über den jeweiligen Git-Branch.

### Environment Variables

Firebase-Werte können in Cloudflare Pages als Environment Variables hinterlegt werden, beispielsweise:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_APPCHECK_SITE_KEY
```

Der Build erzeugt daraus automatisch die benötigte:

```text
firebase-config.json
```

### Wichtig

**Environment Variables mit Secrets gehören ausschließlich in die Cloudflare-Konfiguration und nicht in Git.**

Der Firebase Web API Key ist dabei kein klassisches Geheimnis. Entscheidend sind korrekte Firebase-Sicherheitsregeln, Authentication-Konfiguration und App Check.

## 7. Sicherheitscheck vor Veröffentlichung

Vor dem ersten öffentlichen Deployment prüfen:

```text
[ ] firebase-config.json nicht im Git-Repository
[ ] keine Secrets im Quellcode
[ ] Firestore-Regeln veröffentlicht
[ ] Anonymous Authentication aktiviert
[ ] App Check eingerichtet
[ ] App Check für Firestore aktiviert
[ ] App Check für Authentication aktiviert
[ ] Produktionsdomain bei reCAPTCHA eingetragen
[ ] lokaler Debug-Token nicht produktiv ausgeliefert
```

## 8. Aktualisierung

Nach Änderungen am Projekt:

```bash
npm test
```

Bei Änderungen am Firebase-SDK:

```bash
npm ci
npm run build:firebase
npm test
```

Bei einer neuen App-Version müssen `APP_VERSION` im Service Worker sowie die entsprechenden Versionsangaben in `index.html` und `package.json` aktualisiert werden.
