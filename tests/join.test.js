/**
 * Beitreten mit Name und Passwort.
 *
 * Diese Rechnung ist der Türgriff der geteilten Kasse: dieselben zwei Angaben
 * müssen auf jedem Gerät dieselbe Kennung und denselben Nachweis ergeben —
 * heute, nächstes Jahr und nach jedem Update. Ändert sich hier etwas, kommt
 * niemand mehr in seine bestehende Kasse. Deshalb stehen die erwarteten Werte
 * ausgeschrieben da und nicht nur die Regeln, nach denen sie entstehen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeJoinName, checkJoinName, checkPassword, tripIdForName, joinProofFor, suggestPassword } from '../js/join.js';

test('der Name wird so eingeebnet, wie Leute ihn tippen', () => {
  assert.equal(normalizeJoinName('  Roadtrip   Süd 2026 '), 'roadtrip sud 2026');
  assert.equal(normalizeJoinName('ROADTRIP-SÜD-2026'), 'roadtrip sud 2026');
  assert.equal(normalizeJoinName('Roadtrip, Süd! (2026)'), 'roadtrip sud 2026');
  assert.equal(normalizeJoinName('Straßenfest'), 'strassenfest');
});

test('zu dürftige Namen und Passwörter fallen vorher auf', () => {
  assert.match(checkJoinName(''), /Namen eintragen/);
  assert.match(checkJoinName('… …'), /Namen eintragen/);
  assert.match(checkJoinName('ab'), /mindestens/);
  assert.equal(checkJoinName('Nordkap 2027'), null);

  assert.match(checkPassword(''), /Passwort eintragen/);
  assert.match(checkPassword('kurz'), /mindestens/);
  assert.equal(checkPassword('sonne-welle-42'), null);
});

test('dieselbe Kasse, egal wie der Name geschrieben steht', async () => {
  const a = await tripIdForName('Roadtrip Süd 2026');
  const b = await tripIdForName('  roadtrip-süd-2026  ');
  assert.equal(a, b);
  assert.notEqual(a, await tripIdForName('Roadtrip Nord 2026'));
  // Firestore-Kennung: fängt nicht mit einer Ziffer an, keine Sonderzeichen.
  assert.match(a, /^k[0-9a-f]{31}$/);
});

test('die Kennung bleibt über Fassungen hinweg dieselbe', async () => {
  // Fest verdrahtet: wer diesen Wert ändert, sperrt bestehende Kassen aus.
  assert.equal(await tripIdForName('Roadtrip Süd 2026'), 'kcc541ca8c90bb9c101b8607c2f98333');
});

test('der Nachweis hängt an Name und Passwort — und nur daran', async () => {
  const proof = await joinProofFor('Roadtrip Süd 2026', 'sonne-welle-42');
  assert.equal(proof, await joinProofFor('roadtrip süd 2026', 'sonne-welle-42'), 'Schreibweise des Namens ist egal');
  assert.notEqual(proof, await joinProofFor('Roadtrip Süd 2026', 'Sonne-Welle-42'), 'Passwort zählt genau');
  assert.notEqual(proof, await joinProofFor('Roadtrip Nord 2026', 'sonne-welle-42'), 'anderer Name, anderer Nachweis');

  // Die Sicherheitsregeln verlangen mindestens acht Zeichen im Dokument.
  assert.match(proof, /^[0-9a-f]{64}$/);
});

test('das Passwort steht nicht im Nachweis', async () => {
  const proof = await joinProofFor('Inseltour', 'geheim-123');
  assert.ok(!proof.includes('geheim'));
});

test('der Vorschlag lässt sich vorlesen', () => {
  for (let i = 0; i < 20; i++) {
    const suggestion = suggestPassword();
    assert.equal(checkPassword(suggestion), null);
    assert.match(suggestion, /^[a-z]+-[a-z]+-\d\d$/);
  }
});
