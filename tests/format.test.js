/**
 * Zahlenformatierung — hier vor allem `duration`/`distanceKm`, für die
 * Fahrzeit-Anzeige auf „Heute“ (siehe `views/today.js`, `travel.js`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { duration, distanceKm } from '../js/format.js';

test('duration zeigt Minuten unter einer Stunde', () => {
  assert.equal(duration(0), '0 Min.');
  assert.equal(duration(59), '1 Min.', 'wird auf ganze Minuten gerundet');
  assert.equal(duration(18 * 60), '18 Min.');
});

test('duration zeigt Stunden und Minuten darüber', () => {
  assert.equal(duration(65 * 60), '1 Std. 5 Min.');
  assert.equal(duration(120 * 60), '2 Std.', 'ohne Rest keine „0 Min.“ dahinter');
});

test('duration verträgt negative oder fehlende Werte', () => {
  assert.equal(duration(-30), '0 Min.');
  assert.equal(duration(undefined), '0 Min.');
});

test('distanceKm zeigt Meter unter einem Kilometer', () => {
  assert.equal(distanceKm(0), '0 m');
  assert.equal(distanceKm(850), '850 m');
});

test('distanceKm zeigt Kilometer mit einer Nachkommastelle darüber', () => {
  assert.equal(distanceKm(12000), '12,0 km');
  assert.equal(distanceKm(12345), '12,3 km');
});
