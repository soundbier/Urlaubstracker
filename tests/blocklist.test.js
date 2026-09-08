/**
 * Die mitgelieferte Sperrliste für Wegwerf-Adressen.
 *
 * Jede Zeile dieser Datei wird zu einer Firestore-Dokumentkennung — und die
 * verträgt nicht alles. Ein Schrägstrich, ein Leerzeichen, ein Großbuchstabe
 * oder eine CRLF-Zeile aus einem Windows-Editor ergäbe entweder einen
 * abgelehnten Schreibvorgang oder, schlimmer, eine Kennung, die nie getroffen
 * wird: die Domain stünde dann in der Liste und bremste trotzdem nichts.
 *
 * Deshalb prüft dieser Test die Datei, wie das Skript sie liest — und nicht,
 * ob eine bestimmte Domain darin vorkommt. Welche Domains auf der Liste
 * stehen, entscheidet die Quelle (disposable-email-domains, CC0), nicht diese
 * Prüfung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = await readFile(join(root, 'tools', 'disposable-email-blocklist.conf'), 'utf8');
const lines = raw.split('\n');
// Die letzte Zeile ist der Rest hinter dem letzten Zeilenumbruch — leer, wenn
// die Datei ordentlich endet.
const domains = lines.filter((l) => l !== '');

test('die Liste ist da und nicht aus Versehen leer', () => {
  assert.ok(domains.length > 1000, `nur ${domains.length} Einträge — das sieht nach einer abgeschnittenen Datei aus`);
});

test('jede Zeile taugt als Firestore-Dokumentkennung', () => {
  // Dieselbe Prüfung, die auch `seed-blocklist.mjs` anlegt. Was hier
  // durchfällt, würde dort stillschweigend übersprungen — und niemand sähe es.
  const usable = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  const bad = domains.filter((d) => !usable.test(d));
  assert.deepEqual(bad.slice(0, 10), [], `unbrauchbare Zeilen (${bad.length} insgesamt)`);
});

test('keine Windows-Zeilenenden', () => {
  // `\r` am Ende würde zu einer Kennung „example.com\r“ führen: sie stünde in
  // der Datenbank und würde nie gefunden.
  assert.equal(raw.includes('\r'), false, 'die Datei enthält CR-Zeichen');
});

test('keine Doppelungen', () => {
  const seen = new Set();
  const dupes = domains.filter((d) => (seen.has(d) ? true : (seen.add(d), false)));
  assert.deepEqual(dupes.slice(0, 10), [], `doppelte Einträge (${dupes.length} insgesamt)`);
});

test('die Liste wird nicht mit der App ausgeliefert', async () => {
  // Sie ist Werkzeug, kein Teil der App: 124 KB im Offline-Paket, die niemand
  // im Browser braucht — gelesen wird zur Laufzeit Firestore (siehe auth.js).
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /disposable-email-blocklist/);
});
