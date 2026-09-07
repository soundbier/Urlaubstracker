/**
 * Was in vendor/firebase.js steckt — als Angabe, die sich prüfen lässt.
 *
 * Getrennt vom Bau-Skript, weil die Tests das hier lesen: sie laufen auf einem
 * frischen Checkout ohne `node_modules`, und ein `import 'esbuild'` an dieser
 * Stelle würde `npm test` genau dort scheitern lassen.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const BUNDLE_FILE = join(ROOT, 'vendor', 'firebase.js');
export const LOCK_FILE = join(ROOT, 'vendor', 'firebase.lock.json');

/**
 * Was die App aus dem SDK überhaupt benutzt. Alles andere fällt beim Bündeln
 * weg — kommt hier etwas dazu, ändert sich der Fingerabdruck mit, und das
 * Bündel muss neu gebaut werden.
 */
export const ENTRY = `
export { initializeApp, getApps, deleteApp } from 'firebase/app';
export {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence,
  browserLocalPersistence, signOut
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, updateDoc, deleteDoc, deleteField, getDoc, getDocs,
  onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch, Timestamp, enableNetwork, disableNetwork
} from 'firebase/firestore';
export { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
`;

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export const readPkg = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** Die Angaben, die neben dem Bündel liegen — und gegen die `npm test` prüft. */
export function fingerprint(bundle, pkg = readPkg()) {
  return {
    firebase: pkg.devDependencies.firebase,
    esbuild: pkg.devDependencies.esbuild,
    bytes: bundle.length,
    sha256: sha256(bundle),
    entrySha256: sha256(ENTRY),
  };
}
