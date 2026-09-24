/**
 * Der Vergleich, an dem hängt, ob die Oberfläche neu gebaut wird.
 *
 * Sagt er zu oft „anders“, baut die App umsonst neu — lästig, aber richtig.
 * Sagt er einmal zu Unrecht „gleich“, bleibt eine Ausgabe unsichtbar, die
 * jemand gerade eingetragen hat. Deshalb steht hier vor allem, was er
 * auseinanderhalten muss.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { same, keepSame } from '../js/equal.js';

test('gleicher Inhalt in frischen Objekten gilt als gleich', () => {
  assert.equal(same(1, 1), true);
  assert.equal(same('a', 'a'), true);
  assert.equal(same(null, null), true);
  assert.equal(same({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true);
  assert.equal(same([1, 2, 3], [1, 2, 3]), true);
  assert.equal(
    same({ rows: [{ id: 'a', amount: 1200 }] }, { rows: [{ id: 'a', amount: 1200 }] }),
    true,
  );
});

test('die Reihenfolge der Schlüssel spielt keine Rolle, die der Zeilen schon', () => {
  assert.equal(same({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  // Die Listen kommen sortiert aus dem Store — zwei verschiedene Reihenfolgen
  // sind zwei verschiedene Bilder.
  assert.equal(same([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]), false);
});

test('ein geänderter Betrag ist eine Änderung', () => {
  assert.equal(same({ amount: 1200 }, { amount: 1300 }), false);
  // Und zwar auch tief drin, nicht nur in der obersten Zeile.
  assert.equal(
    same({ rows: [{ id: 'a', note: 'Kaffee' }] }, { rows: [{ id: 'a', note: 'Kuchen' }] }),
    false,
  );
});

test('eine Zeile mehr oder weniger ist eine Änderung', () => {
  assert.equal(same([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]), false);
  assert.equal(same([], [{ id: 'a' }]), false);
});

test('ein Feld mehr ist eine Änderung — auch ein leeres', () => {
  assert.equal(same({ a: 1 }, { a: 1, b: 2 }), false);
  // `{ note: undefined }` und „gar keine Notiz“ sehen beim Lesen gleich aus.
  // Für den Vergleich sind es zwei verschiedene Zeilen; das ist die sichere
  // Richtung, denn eine gelöschte Notiz ist eine Änderung.
  assert.equal(same({ id: 'a' }, { id: 'a', note: undefined }), false);
});

test('Zahl, Zeichenkette und Wahrheitswert werden nicht verwechselt', () => {
  assert.equal(same(0, '0'), false);
  assert.equal(same(0, false), false);
  assert.equal(same(null, undefined), false);
  assert.equal(same(null, {}), false);
  assert.equal(same([], {}), false);
});

test('keepSame behält das alte Feld, solange nichts Neues darin steht', () => {
  const rows = [{ id: 'a', amount: 1200 }];

  // Derselbe Inhalt in einem frischen Feld — genau das, was die Backends bei
  // jeder Meldung hereinreichen.
  assert.equal(keepSame(rows, [{ id: 'a', amount: 1200 }]), rows);

  // Und sobald wirklich etwas passiert ist, das neue.
  const next = [{ id: 'a', amount: 1300 }];
  assert.equal(keepSame(rows, next), next);
});

test('keepSame kommt mit einem leeren Anfang zurecht', () => {
  assert.equal(keepSame(undefined, null), null);
  const first = [{ id: 'a' }];
  assert.equal(keepSame(undefined, first), first);
});
