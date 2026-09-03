#!/usr/bin/env node
/**
 * Fragt nach, ob das, was wir ausliefern, noch in Ordnung ist.
 *
 *   npm run check:deps
 *
 * Zwei Fragen, jede Woche einmal (siehe .github/workflows/dependencies.yml):
 *
 *   1. Steckt in einer der festgenagelten Fassungen eine bekannte Lücke?
 *      → `npm audit` gegen package-lock.json. Das ist der Teil, der den Lauf
 *        rot werden lässt.
 *   2. Gibt es inzwischen etwas Neueres?
 *      → Registry fragen. Das meldet nur; die Aktualisierung selbst schlägt
 *        Dependabot als Pull Request vor (.github/dependabot.yml).
 *
 * Dazu die Gegenprobe, dass vendor/firebase.js wirklich zu der Fassung gehört,
 * die in package.json steht — sonst nützt das beste Update nichts, weil das
 * ausgelieferte Bündel ein anderes ist. Dieselbe Prüfung läuft bei jedem
 * `npm test` mit (tests/deps.test.js), hier steht sie nur mit im Bericht.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, BUNDLE_FILE, LOCK_FILE, fingerprint, readPkg } from './firebase-bundle.mjs';

const pkg = readPkg();
const problems = [];
const notes = [];

// ------------------------------------------------------- Bekannte Lücken

function audit() {
  if (!existsSync(join(ROOT, 'package-lock.json'))) {
    problems.push('package-lock.json fehlt — ohne Lockfile lässt sich nichts prüfen.');
    return;
  }
  let raw;
  try {
    // `npm audit` endet mit Status 1, sobald es etwas findet: das ist keine
    // Störung, sondern das Ergebnis. Deshalb hier abfangen und den Bericht
    // trotzdem lesen.
    raw = execFileSync('npm', ['audit', '--json', '--audit-level=none'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    raw = err?.stdout || '';
    if (!raw.trim()) {
      problems.push(`npm audit ließ sich nicht ausführen: ${err?.message || err}`);
      return;
    }
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    problems.push('npm audit hat nichts Lesbares geliefert.');
    return;
  }

  const found = Object.values(report.vulnerabilities || {}).filter((v) => v.severity && v.severity !== 'info');
  if (!found.length) {
    notes.push('Keine bekannten Sicherheitslücken in den festgelegten Fassungen.');
    return;
  }
  for (const v of found) {
    const via = (v.via || []).map((x) => (typeof x === 'string' ? x : `${x.title} (${x.url || 'ohne Link'})`)).join('; ');
    problems.push(`${v.name}: ${v.severity} — ${via || 'ohne nähere Angabe'}`);
  }
}

// ------------------------------------------------------------ Was gibt es Neues

async function latest(name) {
  const res = await fetch(`https://registry.npmjs.org/${name}/latest`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Registry antwortete mit ${res.status}`);
  return (await res.json()).version;
}

async function freshness() {
  for (const [name, pinned] of Object.entries(pkg.devDependencies)) {
    try {
      const now = await latest(name);
      notes.push(now === pinned ? `${name}@${pinned} ist die aktuelle Fassung.` : `${name}: ${pinned} festgelegt, ${now} ist draußen — Dependabot schlägt das Update als Pull Request vor.`);
    } catch (err) {
      problems.push(`${name}: Fassung ließ sich nicht nachschlagen (${err.message}).`);
    }
  }
}

// ------------------------------------------------- Gehört das Bündel zur Fassung?

function vendorMatchesLock() {
  if (!existsSync(BUNDLE_FILE) || !existsSync(LOCK_FILE)) {
    problems.push('vendor/firebase.js oder vendor/firebase.lock.json fehlt.');
    return;
  }
  const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  const actual = fingerprint(readFileSync(BUNDLE_FILE), pkg);
  if (lock.sha256 !== actual.sha256 || lock.firebase !== actual.firebase) {
    problems.push(`vendor/firebase.js passt nicht zu package.json (${lock.firebase} gebaut, ${actual.firebase} festgelegt). „npm ci && npm run build:firebase“.`);
    return;
  }
  notes.push(`vendor/firebase.js ist firebase@${lock.firebase} (${(lock.bytes / 1024).toFixed(0)} KB, sha256 ${lock.sha256.slice(0, 12)}…).`);
}

vendorMatchesLock();
audit();
await freshness();

for (const n of notes) console.log(`  ok   ${n}`);
for (const p of problems) console.log(`  !    ${p}`);

if (problems.length) {
  console.log('\nEs gibt etwas zu tun — siehe oben.');
  process.exit(1);
}
console.log('\nAlles in Ordnung.');
