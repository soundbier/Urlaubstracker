#!/usr/bin/env node
/**
 * Bündelt das Firebase-Web-SDK zu einer einzelnen ESM-Datei in vendor/firebase.js.
 *
 * Damit braucht die App zur Laufzeit kein CDN: der Service Worker kann das SDK
 * mit dem restlichen App-Shell cachen und alles läuft offline.
 *
 * Gebaut wird aus dem, was `package.json` und `package-lock.json` festnageln —
 * nicht aus „was gerade neu ist“. Vorher installierte das Skript sich seine
 * Abhängigkeiten in ein Temp-Verzeichnis: jeder Lauf konnte ein anderes Bündel
 * ergeben, ohne dass irgendwo stand, welches gerade ausgeliefert wird. Jetzt:
 *
 *   npm ci                    # genau die Fassungen aus package-lock.json
 *   npm run build:firebase    # baut vendor/firebase.js daraus
 *
 * Danach steht in `vendor/firebase.lock.json`, welche Fassung drinsteckt und
 * welchen Fingerabdruck die Datei hat. `npm test` prüft beides gegeneinander,
 * `npm run check:deps` fragt zusätzlich nach bekannten Sicherheitslücken.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, BUNDLE_FILE, LOCK_FILE, ENTRY, fingerprint, readPkg } from './firebase-bundle.mjs';

const pkg = readPkg();
const wanted = pkg.devDependencies.firebase;
const installed = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'node_modules', 'firebase', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
})();

if (installed !== wanted) {
  console.error(
    installed
      ? `node_modules hat firebase@${installed}, package.json nennt ${wanted}. Erst „npm ci“, dann noch einmal.`
      : 'Es fehlt node_modules. Erst „npm ci“, dann „npm run build:firebase“.',
  );
  process.exit(1);
}

const result = await build({
  stdin: { contents: ENTRY, resolveDir: ROOT, sourcefile: 'entry.js', loader: 'js' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  write: false,
});

const bundle = Buffer.from(result.outputFiles[0].contents);
writeFileSync(BUNDLE_FILE, bundle);
const lock = fingerprint(bundle, pkg);
writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`vendor/firebase.js aktualisiert: firebase@${lock.firebase}, ${(lock.bytes / 1024).toFixed(0)} KB.`);
console.log(`sha256 ${lock.sha256}`);
console.log('Nicht vergessen: APP_VERSION in sw.js hochzählen.');
