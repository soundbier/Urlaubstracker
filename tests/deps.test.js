/**
 * Was ausgeliefert wird, muss das sein, was festgenagelt ist.
 *
 * vendor/firebase.js ist ein von Hand gebautes Bündel — die einzige fremde
 * Codebasis in dieser App und die einzige, in der eine Lücke stecken könnte,
 * ohne dass es hier jemand merkt. Bisher stand die Fassung nur als Zahl im
 * Bau-Skript: kein Lockfile, kein Fingerabdruck, keine Prüfung. Ein Update
 * fiel auf, wenn jemand daran dachte.
 *
 * Diese Prüfungen schließen die Lücke von unten: die Fassung steht in
 * package.json (damit Dependabot sie sieht), das Bündel trägt einen
 * Fingerabdruck (damit „aktualisiert“ nicht heißt: Zahl geändert, Datei alt),
 * und beides muss zusammenpassen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, BUNDLE_FILE, LOCK_FILE, ENTRY, sha256, fingerprint, readPkg } from '../tools/firebase-bundle.mjs';

const pkg = readPkg();

test('die Fassungen stehen exakt fest, nicht als Spanne', () => {
  const deps = Object.entries(pkg.devDependencies || {});
  assert.ok(deps.length, 'package.json nennt devDependencies');
  for (const [name, range] of deps) {
    // `^12.18.0` würde bedeuten: geprüft wurde 12.18.0, gebaut wird
    // irgendetwas — und niemand könnte sagen, was im Bündel steckt.
    assert.match(range, /^\d+\.\d+\.\d+$/, `${name} ist auf eine feste Fassung genagelt`);
  }
});

test('es gibt ein Lockfile, und es kennt dieselbe Firebase-Fassung', () => {
  const path = join(ROOT, 'package-lock.json');
  assert.ok(existsSync(path), 'package-lock.json liegt im Repository');
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(lock.lockfileVersion >= 3, 'Lockfile ist aktuell genug für npm audit');
  const entry = lock.packages?.['node_modules/firebase'];
  assert.ok(entry, 'firebase steht im Lockfile');
  assert.equal(entry.version, pkg.devDependencies.firebase);
  // Ohne Prüfsumme wäre das Lockfile nur eine Liste von Wünschen.
  assert.match(String(entry.integrity || ''), /^sha\d{3}-/, 'mit Integritätsprüfsumme');
});

test('vendor/firebase.js ist genau das Bündel, das die Angaben beschreiben', () => {
  assert.ok(existsSync(LOCK_FILE), 'vendor/firebase.lock.json liegt daneben');
  const recorded = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  const actual = fingerprint(readFileSync(BUNDLE_FILE), pkg);

  // Der häufigste Fall, den das hier abfängt: Dependabot hebt die Fassung in
  // package.json an, das Bündel wird aber nicht neu gebaut. Die App liefe
  // danach weiter mit dem alten SDK — inklusive der Lücke, wegen der die neue
  // Fassung überhaupt erschienen ist.
  assert.equal(recorded.firebase, pkg.devDependencies.firebase, 'gebaute Fassung = festgelegte Fassung — sonst: npm ci && npm run build:firebase');
  assert.equal(recorded.esbuild, pkg.devDependencies.esbuild, 'mit dem festgelegten esbuild gebaut');
  assert.equal(actual.sha256, recorded.sha256, 'vendor/firebase.js wurde seit dem Bauen nicht verändert');
  assert.equal(actual.bytes, recorded.bytes);
});

test('der Ausschnitt des SDK, den wir bündeln, ist mitgeprüft', () => {
  const recorded = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  // Kommt ein Export dazu, ohne dass jemand neu baut, fehlt er zur Laufzeit —
  // und zwar erst dort, wo er gebraucht wird.
  assert.equal(sha256(ENTRY), recorded.entrySha256, 'Einstiegsdatei geändert? Dann: npm run build:firebase');
});

test('das Bündel bringt alles mit, was die App importiert', () => {
  const bundle = readFileSync(BUNDLE_FILE, 'utf8');
  const source = readFileSync(join(ROOT, 'js', 'backend-firestore.js'), 'utf8');
  const used = new Set([...source.matchAll(/\bfb\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  assert.ok(used.size > 10, 'die benutzten Namen wurden gefunden');

  // Der Export steht am Ende des Bündels als `x as name` — genau danach
  // fragen wir, statt irgendwo im minifizierten Rumpf zu suchen.
  const exported = new Set([...bundle.matchAll(/(?:as|export\s*\{)\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)].map((m) => m[1]));
  for (const name of used) {
    assert.ok(exported.has(name), `backend-firestore.js benutzt fb.${name} — im Bündel gibt es das nicht`);
  }
});
