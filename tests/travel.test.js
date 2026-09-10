/**
 * Welche benachbarten Stationen eines Tages eine Fahrzeit bekommen können —
 * die reine Kettenlogik aus `travel.js`, ohne Netzzugriff (siehe dort,
 * `segmentTravelTime`, das bewusst ungetestet bleibt).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { travelPairs } from '../js/travel.js';

const item = (id, location, extra = {}) => ({ id, title: `Punkt ${id}`, location, ...extra });

test('ohne Unterkunft und ohne Adressen gibt es keine Strecke', () => {
  assert.deepEqual(travelPairs([item('a', '')], null), []);
  assert.deepEqual(travelPairs([], null), []);
});

test('zwei benachbarte Programmpunkte mit Adresse bekommen eine Strecke', () => {
  const pairs = travelPairs([item('a', 'Adresse A'), item('b', 'Adresse B')], null);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].key, 'item:a>item:b');
  assert.equal(pairs[0].fromAddress, 'Adresse A');
  assert.equal(pairs[0].toAddress, 'Adresse B');
  assert.equal(pairs[0].fromIsStay, false);
});

test('ein Punkt ohne Adresse dazwischen bricht die Kette an beiden Seiten ab', () => {
  const pairs = travelPairs([item('a', 'Adresse A'), item('b', ''), item('c', 'Adresse C')], null);
  // Weder a→b noch b→c: b hat keine Adresse. Und a→c wird nicht stillschweigend
  // übersprungen — sonst stünde da eine Fahrzeit, die tut, als gäbe es b nicht.
  assert.deepEqual(pairs, []);
});

test('die Unterkunft zählt als erste Station, wenn sie eine Adresse hat', () => {
  const stay = { id: 's1', address: ' Seestraße 12, 8280 Kreuzlingen ' };
  const pairs = travelPairs([item('a', 'Museumsplatz 5')], stay);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].key, 'stay:s1>item:a');
  assert.equal(pairs[0].fromAddress, 'Seestraße 12, 8280 Kreuzlingen', 'wird getrimmt');
  assert.equal(pairs[0].fromIsStay, true);
});

test('eine Unterkunft ohne Adresse liefert keine erste Strecke', () => {
  const stay = { id: 's1', address: '' };
  const pairs = travelPairs([item('a', 'Museumsplatz 5'), item('b', 'Rathaus 1')], stay);
  assert.equal(pairs.length, 1, 'nur die Strecke zwischen a und b');
  assert.equal(pairs[0].key, 'item:a>item:b');
});

test('eine durchgehende Kette liefert eine Strecke pro Übergang', () => {
  const stay = { id: 's1', address: 'Unterkunft' };
  const items = [item('a', 'A'), item('b', 'B'), item('c', 'C')];
  const pairs = travelPairs(items, stay);
  assert.deepEqual(pairs.map((p) => p.key), ['stay:s1>item:a', 'item:a>item:b', 'item:b>item:c']);
  assert.deepEqual(pairs.map((p) => p.fromIsStay), [true, false, false]);
});
