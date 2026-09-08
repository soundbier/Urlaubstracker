#!/usr/bin/env node
/**
 * Die Sperrliste für Wegwerf-E-Mail-Adressen nach Firestore schreiben.
 *
 * Quelle ist die öffentliche Liste von disposable-email-domains
 * (https://github.com/disposable-email-domains/disposable-email-domains),
 * CC0 — eine Zeile je Domain, kleingeschrieben. Daraus wird die Sammlung
 * `blockedEmailDomains`, in der jede Domain ein leeres Dokument mit ihrem
 * Namen als Kennung ist: mehr braucht es nicht, denn gefragt wird immer nur
 * „gibt es das?“ (`exists()` in `firestore.rules`, `getDoc` in `auth.js`).
 *
 * Warum in Firestore und nicht als Datei in der App: die Regeln müssen die
 * Liste lesen können, und Regeln lesen nur Firestore. Läge sie zusätzlich als
 * Datei in der App, wären es über kurz oder lang zwei verschiedene Listen —
 * und die App würde jemanden durchlassen, den der Server dann abweist. Der
 * Nebeneffekt ist angenehm: die 124 KB liegen nicht im Offline-Paket der PWA.
 *
 * Aufruf:
 *
 *   # einmalig: Zugangsdaten eines Dienstkontos mit Firestore-Schreibrecht
 *   export GOOGLE_APPLICATION_CREDENTIALS=/pfad/zu/serviceAccountKey.json
 *   npm i --no-save firebase-admin                     # nicht Teil der App
 *   node tools/seed-blocklist.mjs disposable.conf
 *
 * Die Datei mit den Domains lädt man sich vorher, damit dieser Lauf
 * nachvollziehbar bleibt und nicht davon abhängt, was gerade im Netz steht:
 *
 *   curl -fsSLO https://raw.githubusercontent.com/disposable-email-domains/\
 * disposable-email-domains/main/disposable_email_blocklist.conf
 *
 * Der Lauf ist wiederholbar: bestehende Einträge werden überschrieben, neue
 * kommen dazu. Was aus der Quelle *verschwindet*, bleibt hier stehen — mit
 * `--prune` wird auch das abgeräumt.
 */
import { readFile } from 'node:fs/promises';

const BATCH = 500; // Firestore nimmt höchstens 500 Schreibvorgänge pro Stapel.
const COLLECTION = 'blockedEmailDomains';

const args = process.argv.slice(2);
const prune = args.includes('--prune');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('Aufruf: node tools/seed-blocklist.mjs <datei.conf> [--prune]');
  process.exit(1);
}

/** Nur, was auch als Firestore-Dokumentkennung taugt — der Rest fliegt sichtbar raus. */
const USABLE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const raw = (await readFile(file, 'utf8')).split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean);
const domains = [...new Set(raw.filter((d) => USABLE.test(d)))];
const skipped = raw.filter((d) => !USABLE.test(d));

if (skipped.length) console.warn(`${skipped.length} Zeile(n) übersprungen, z. B.: ${skipped.slice(0, 5).join(', ')}`);
if (!domains.length) {
  console.error('Keine brauchbaren Domains in der Datei.');
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

console.log(`${domains.length} Domains → ${COLLECTION} …`);

let written = 0;
for (let i = 0; i < domains.length; i += BATCH) {
  const chunk = domains.slice(i, i + BATCH);
  const batch = db.batch();
  // Ein leeres Dokument reicht: gefragt wird nur nach seiner Existenz. Was
  // nicht drinsteht, kann auch nicht veralten.
  for (const domain of chunk) batch.set(db.collection(COLLECTION).doc(domain), {});
  await batch.commit();
  written += chunk.length;
  process.stdout.write(`\r  ${written}/${domains.length}`);
}
process.stdout.write('\n');

if (prune) {
  const wanted = new Set(domains);
  const existing = await db.collection(COLLECTION).select().get();
  const gone = existing.docs.filter((d) => !wanted.has(d.id));
  console.log(`${gone.length} Eintrag/Einträge nicht mehr in der Quelle — werden entfernt.`);
  for (let i = 0; i < gone.length; i += BATCH) {
    const batch = db.batch();
    for (const doc of gone.slice(i, i + BATCH)) batch.delete(doc.ref);
    await batch.commit();
  }
}

console.log('Fertig.');
process.exit(0);
