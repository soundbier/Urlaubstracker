#!/usr/bin/env node
/**
 * Bündelt das Firebase-Web-SDK zu einer einzelnen ESM-Datei in vendor/firebase.js.
 *
 * Damit braucht die App zur Laufzeit kein CDN: der Service Worker kann das SDK
 * mit dem restlichen App-Shell cachen und alles läuft offline.
 *
 *   node tools/build-firebase.mjs [version]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2] || '12.18.0';
const work = mkdtempSync(join(tmpdir(), 'fb-'));

const entry = `
export { initializeApp, getApps, deleteApp } from 'firebase/app';
export {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence,
  browserLocalPersistence, signOut
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch, Timestamp, enableNetwork, disableNetwork
} from 'firebase/firestore';
export { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
`;

try {
  writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'fb-bundle', private: true }));
  writeFileSync(join(work, 'entry.js'), entry);
  const run = (cmd, args) =>
    execFileSync(cmd, args, { cwd: work, stdio: 'inherit', shell: process.platform === 'win32' });

  run('npm', ['install', '--no-audit', '--no-fund', `firebase@${version}`, 'esbuild']);
  run('npx', [
    'esbuild', 'entry.js', '--bundle', '--format=esm', '--minify',
    '--target=es2020', '--legal-comments=none', '--outfile=firebase.js',
  ]);

  copyFileSync(join(work, 'firebase.js'), join(root, 'vendor', 'firebase.js'));
  console.log(`\nvendor/firebase.js aktualisiert (firebase@${version}).`);
  console.log('Nicht vergessen: CACHE_VERSION in sw.js hochzählen.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
