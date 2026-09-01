#!/usr/bin/env node
/**
 * Schreibt firebase-config.json aus Umgebungsvariablen — gedacht für den
 * Build-Schritt bei Cloudflare Pages.
 *
 * Damit landen die Firebase-Werte nie im Git-Repository: sie stehen bei
 * Cloudflare unter Workers & Pages → Projekt → Settings → Variables and
 * secrets, und werden erst beim Bauen in die Datei geschrieben, die die App
 * zur Laufzeit lädt (siehe js/store.js, loadAmbientConfig).
 *
 * Erwartete Variablen (Namen wie im Firebase-Konsolenblock):
 *   FIREBASE_API_KEY              (Pflicht)
 *   FIREBASE_AUTH_DOMAIN          (Pflicht)
 *   FIREBASE_PROJECT_ID           (Pflicht)
 *   FIREBASE_APP_ID               (Pflicht)
 *   FIREBASE_STORAGE_BUCKET       (optional)
 *   FIREBASE_MESSAGING_SENDER_ID  (optional)
 *
 * Ist keine einzige davon gesetzt, tut das Skript nichts — dann liefert
 * Cloudflare wie bisher ohne firebase-config.json aus, und die Konfiguration
 * kommt von Hand ins Gerät oder über einen Einladungslink. Sind einige, aber
 * nicht alle Pflichtfelder gesetzt, bricht der Build ab: das ist dann eine
 * unvollständige Einrichtung und kein Normalfall, der still übergangen werden
 * sollte.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const required = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  projectId: 'FIREBASE_PROJECT_ID',
  appId: 'FIREBASE_APP_ID',
};
const optional = {
  storageBucket: 'FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
};

const requiredKeys = Object.keys(required);
const setRequired = requiredKeys.filter((k) => process.env[required[k]]);

if (setRequired.length === 0) {
  console.log('write-firebase-config: keine FIREBASE_*-Variablen gesetzt — firebase-config.json bleibt aus.');
  process.exit(0);
}

const missing = requiredKeys.filter((k) => !process.env[required[k]]);
if (missing.length) {
  console.error(
    `write-firebase-config: unvollständig — es fehlt ${missing.map((k) => required[k]).join(', ')}.`
  );
  process.exit(1);
}

const config = {};
for (const [key, envName] of Object.entries(required)) config[key] = process.env[envName];
for (const [key, envName] of Object.entries(optional)) {
  if (process.env[envName]) config[key] = process.env[envName];
}

writeFileSync(join(root, 'firebase-config.json'), JSON.stringify(config, null, 2) + '\n');
console.log('write-firebase-config: firebase-config.json geschrieben.');
