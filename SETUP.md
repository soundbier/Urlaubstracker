# Setup

## Deutsch

Diese Anleitung beschreibt die Einrichtung des Urlaubstrackers mit Firebase und Cloudflare Pages.

### 1. Firebase-Projekt erstellen

In der [Firebase Console](https://console.firebase.google.com/) ein neues Projekt erstellen.

Anschließend:

**Authentication → Sign-in method**

* Anonymous Authentication aktivieren

**Firestore Database**

* Datenbank erstellen
* Produktionsmodus verwenden
* möglichst eine EU-Region auswählen

### 2. Firestore-Regeln veröffentlichen

Firebase CLI:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

Die Regeln befinden sich in:

```text
firestore.rules
```

Die Firestore Rules bleiben die zentrale Zugriffskontrolle. App Check ersetzt sie nicht.

### 3. Firebase Web-App

Unter:

**Project settings → Your apps → Web-App**

eine Web-App registrieren.

Für die lokale Entwicklung kann `firebase-config.json` verwendet werden. Vorlage:

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

Die Datei mit produktiven Werten darf nicht in Git eingecheckt werden.

### 4. Firebase App Check

Für eine öffentliche Installation sollte Firebase App Check aktiviert werden.

Der Urlaubstracker verwendet **reCAPTCHA Enterprise**.

In Google Cloud einen reCAPTCHA-Enterprise-Websiteschlüssel für die verwendeten Domains erstellen.

In Firebase:

**App Check → Apps → Web-App**

als Anbieter **reCAPTCHA Enterprise** auswählen.

Der Websiteschlüssel wird verwendet als:

```text
appCheckSiteKey
```

Für Cloudflare Pages:

```text
FIREBASE_APPCHECK_SITE_KEY
```

Nach erfolgreicher Prüfung die Durchsetzung unter **App Check → APIs** für folgende Dienste aktivieren:

* Cloud Firestore
* Authentication

### 5. Lokale Entwicklung

```bash
npm test
npm start
```

Danach:

```text
http://localhost:8080
```

Für lokale Tests kann ein App-Check-Debug-Token verwendet werden.

Ein Debug-Token darf niemals in die produktive Anwendung übernommen werden.

### 6. Cloudflare Pages

Repository mit Cloudflare Pages verbinden.

**Build command**

```text
npm run build
```

**Build output directory**

```text
/
```

### Environment Variables

Firebase-Konfiguration und App Check können als Cloudflare Environment Variables hinterlegt werden:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_APPCHECK_SITE_KEY
```

Produktive Werte gehören ausschließlich in die Cloudflare-Konfiguration und nicht in Git.

Der Firebase Web API Key ist grundsätzlich kein Secret. Die Sicherheit wird durch korrekte Firebase Rules, Authentication und App Check gewährleistet.

### 7. Sicherheitscheck

Vor der Veröffentlichung:

```text
[ ] firebase-config.json nicht im Repository
[ ] keine Secrets im Quellcode
[ ] Firestore Rules veröffentlicht
[ ] Anonymous Authentication aktiviert
[ ] App Check eingerichtet
[ ] App Check für Firestore aktiviert
[ ] App Check für Authentication aktiviert
[ ] Produktionsdomain bei reCAPTCHA registriert
[ ] kein Debug-Token in Production
```

### 8. Aktualisierung

```bash
npm ci
npm test
npm run build
```

Bei Änderungen an den Firestore Rules:

```bash
npx firebase-tools deploy --only firestore:rules
```

---

# Setup

## English

This guide describes how to configure the Urlaubstracker with Firebase and Cloudflare Pages.

### 1. Create a Firebase project

Create a new project in the [Firebase Console](https://console.firebase.google.com/).

Then configure:

**Authentication → Sign-in method**

* Enable Anonymous Authentication

**Firestore Database**

* Create a database
* Use production mode
* Prefer an EU region

### 2. Deploy Firestore Rules

Using the Firebase CLI:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

The rules are located in:

```text
firestore.rules
```

Firestore Rules remain the primary access-control mechanism. App Check does not replace them.

### 3. Firebase Web App

Go to:

**Project settings → Your apps → Web-App**

and register a web app.

For local development, `firebase-config.json` can be used. Template:

```text
firebase-config.example.json
```

Example:

```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "appId": "YOUR_APP_ID"
}
```

Do not commit a configuration file containing production values to Git.

### 4. Firebase App Check

For a public deployment, Firebase App Check should be enabled.

Urlaubstracker uses **reCAPTCHA Enterprise**.

Create a reCAPTCHA Enterprise website key in Google Cloud for the domains used by the application.

In Firebase:

**App Check → Apps → Web-App**

select **reCAPTCHA Enterprise** as the provider.

The site key is used as:

```text
appCheckSiteKey
```

For Cloudflare Pages:

```text
FIREBASE_APPCHECK_SITE_KEY
```

After successful testing, enable enforcement under **App Check → APIs** for:

* Cloud Firestore
* Authentication

### 5. Local development

```bash
npm test
npm start
```

Then open:

```text
http://localhost:8080
```

An App Check debug token may be used for local development.

Never ship a debug token with the production application.

### 6. Cloudflare Pages

Connect the repository to Cloudflare Pages.

**Build command**

```text
npm run build
```

**Build output directory**

```text
/
```

### Environment Variables

Firebase configuration and App Check can be stored as Cloudflare Environment Variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_APPCHECK_SITE_KEY
```

Production values should only exist in the Cloudflare configuration and must not be committed to Git.

The Firebase Web API key is not considered a secret by itself. Security relies on properly configured Firebase Rules, Authentication and App Check.

### 7. Security checklist

Before deploying:

```text
[ ] firebase-config.json is not committed
[ ] no secrets are present in source code
[ ] Firestore Rules are deployed
[ ] Anonymous Authentication is enabled
[ ] App Check is configured
[ ] App Check enforcement is enabled for Firestore
[ ] App Check enforcement is enabled for Authentication
[ ] production domains are registered with reCAPTCHA
[ ] no debug token is included in production
```

### 8. Updating

```bash
npm ci
npm test
npm run build
```

When Firestore Rules change:

```bash
npx firebase-tools deploy --only firestore:rules
```
