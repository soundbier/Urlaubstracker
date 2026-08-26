/**
 * Was beim Veröffentlichen zusammenpassen muss.
 *
 * Der Service Worker ist die einzige Stelle, an der die Fassung wirklich
 * entschieden wird — er benennt danach seinen Cache. Alles andere zeigt sie
 * nur an oder liefert sie aus, und darf deshalb nicht davon abweichen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFile(join(root, p), 'utf8');

const sw = await read('sw.js');
const appVersion = /const APP_VERSION = '([^']+)'/.exec(sw)?.[1];

test('sw.js nennt eine Fassung', () => {
  assert.ok(appVersion, 'APP_VERSION steht in sw.js');
  assert.match(appVersion, /^\d+\.\d+\.\d+$/);
});

test('index.html und package.json zeigen dieselbe Fassung', async () => {
  const html = /data-version="([^"]+)"/.exec(await read('index.html'))?.[1];
  const pkg = JSON.parse(await read('package.json')).version;
  // Läuft das auseinander, steht in den Einstellungen eine andere Nummer als
  // im Update-Dialog — und niemand weiß mehr, was gerade läuft.
  assert.equal(html, appVersion, 'data-version in index.html');
  assert.equal(pkg, appVersion, 'version in package.json');
});

test('jede Datei aus dem Paket liegt auch wirklich da', async () => {
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(sw)?.[1] || '';
  const files = [...list.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(files.length > 10, 'SHELL wurde gefunden');

  // `cache.addAll` bricht bei einer einzigen fehlenden Datei ab — dann käme
  // das Update bei niemandem an, ohne dass es vorher auffällt.
  for (const f of files) {
    await access(resolve(root, f)).catch(() => assert.fail(`SHELL nennt ${f}, die Datei fehlt aber`));
  }
});

test('jedes ausgelieferte Modul steht im Paket', async () => {
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(sw)?.[1] || '';
  const shell = new Set([...list.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));

  const { globSync } = await import('node:fs');
  const modules = globSync('js/**/*.js', { cwd: root });
  assert.ok(modules.length > 10, 'Module gefunden');

  // Ein neues Modul, das niemand einträgt, fehlt offline — und zwar genau
  // dann, wenn man es am wenigsten merkt: unterwegs ohne Empfang.
  for (const m of modules.map((p) => p.split('\\').join('/'))) {
    assert.ok(shell.has(m), `${m} fehlt in SHELL in sw.js`);
  }
});
