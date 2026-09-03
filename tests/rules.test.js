/**
 * Die Sicherheitsregeln — als Text geprüft.
 *
 * Ohne Firestore-Emulator lässt sich hier nichts ausführen; was diese
 * Prüfungen können, ist trotzdem das Wichtigste: sie halten die drei
 * Zusicherungen fest, die die Regeln geben, damit keine spätere Vereinfachung
 * sie unbemerkt wieder herausnimmt.
 *
 *   1. Niemand fügt fremde Geräte ohne Passwort hinzu.
 *   2. Ein verlorenes Gerät lässt sich entfernen — aber wer geht, nimmt
 *      niemanden mit.
 *   3. Die ganze Kasse ist nicht mit einem Tipp weg, sobald mehrere Geräte
 *      dranhängen; und die Bedenkzeit misst der Server, nicht das Gerät.
 *
 * Veröffentlicht werden die Regeln von Hand (`firebase deploy --only
 * firestore:rules`) — was hier steht, gilt also erst, wenn das jemand tut.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rules = await readFile(join(root, 'firestore.rules'), 'utf8');

/** Den Rumpf einer `allow …`-Regel herausschneiden, bis zum Semikolon. */
function allowRule(name) {
  const m = new RegExp(`allow ${name}:([\\s\\S]*?);`, 'm').exec(rules);
  assert.ok(m, `es gibt eine Regel für ${name}`);
  return m[1].replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
}

test('Trips lassen sich nicht durchsuchen', () => {
  assert.match(allowRule('list'), /^if false$/);
});

test('beitreten geht nur mit dem Nachweis aus Name und Passwort', () => {
  const update = allowRule('update');
  assert.match(update, /request\.resource\.data\.joinProof == resource\.data\.inviteCode/);
  // Sonst könnte ein Beitretender den Code gleich gegen einen eigenen tauschen.
  assert.match(update, /request\.resource\.data\.inviteCode == resource\.data\.inviteCode/);
  assert.match(update, /size\(\) <= 8/);
});

test('Mitglieder dürfen niemanden hinzufügen — nur entfernen', () => {
  const update = allowRule('update');
  // `hasOnly` ist der Riegel gegen das Hinzufügen: die neue Liste darf nichts
  // enthalten, was nicht schon drinstand.
  assert.match(update, /afterMembers\(\)\.hasOnly\(members\(\)\)/);
  // Und wer sich selbst austrägt, muss alle anderen stehen lassen.
  assert.match(update, /afterMembers\(\)\.hasAll\(members\(\)\.removeAll\(\[request\.auth\.uid\]\)\)/);
  assert.match(update, /request\.auth\.uid in afterMembers\(\)/);
});

test('löschen braucht Bedenkzeit, sobald mehr als ein Gerät dranhängt', () => {
  const del = allowRule('delete');
  assert.match(del, /isMember\(\)/);
  // Genau das war der Zustand vorher: `allow delete: if isMember()`, und ein
  // Tipp räumte die Kasse für alle weg.
  assert.notEqual(del, 'if isMember()');
  assert.match(del, /members\(\)\.size\(\) == 1/);
  assert.match(del, /graceOver\(\)/);
});

test('die Bedenkzeit misst der Server', () => {
  const grace = /function graceOver\(\) \{([\s\S]*?)\}/.exec(rules)?.[1] || '';
  assert.match(grace, /request\.time/, 'verglichen wird gegen die Serverzeit');
  assert.match(grace, /duration\.value\(24, 'h'\)/);
  assert.match(grace, /is timestamp/, 'eine Zahl vom Gerät zählt nicht');

  const honest = /function honestDeleteRequest\(\) \{([\s\S]*?)\n      \}/.exec(rules)?.[1] || '';
  // Ohne diese Bedingung ließe sich der Löschauftrag vordatieren und die
  // Bedenkzeit damit überspringen.
  assert.match(honest, /request\.resource\.data\.deleteRequestedAt == request\.time/);

  // Zwei Wege führen in die Regel — pflegen und beitreten — und beide müssen
  // den Löschauftrag prüfen, sonst bliebe einer davon als Schlupfloch offen.
  const update = allowRule('update');
  assert.equal((update.match(/honestDeleteRequest\(\)/g) || []).length, 2);
});

test('Unterordner bleiben den Mitgliedern vorbehalten', () => {
  assert.match(rules, /allow read, write: if signedIn\(\) && request\.auth\.uid in tripMembers\(\)/);
});
