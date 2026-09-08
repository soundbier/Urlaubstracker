import test from 'node:test';
import assert from 'node:assert/strict';

import { REGIONS, isEuRegion, regionAdvice, retentionOverdue, RETENTION_DAYS, privacySections } from '../js/privacy.js';

test('EU-Regionen sind als solche erkannt, alles andere warnt', () => {
  assert.equal(isEuRegion('eur3'), true);
  assert.equal(isEuRegion('europe-west3'), true);
  assert.equal(isEuRegion('nam5'), false);
  assert.equal(isEuRegion(null), null, 'ohne Angabe ist nichts bekannt');

  assert.equal(regionAdvice('eur3').tone, 'good');
  assert.equal(regionAdvice('nam5').tone, 'over', 'USA ist eine Drittlandübermittlung');
  assert.equal(regionAdvice(null).tone, 'warn', 'unbekannt ist kein grüner Haken');
  assert.equal(regionAdvice('europe-west6').tone, 'good', 'Schweiz: Angemessenheitsbeschluss');
});

test('jede Region trägt Kennung, Klartext und EU-Angabe', () => {
  for (const [id, label, eu] of REGIONS) {
    assert.equal(typeof id, 'string');
    assert.ok(label, `${id} hat einen Klartext`);
    assert.equal(typeof eu, 'boolean');
  }
});

test('ans Löschen erinnert wird erst nach der Aufbewahrungsfrist', () => {
  const end = '2026-07-10';
  const daysAfter = (n) => new Date(Date.parse(`${end}T00:00:00Z`) + n * 86400000);

  assert.equal(retentionOverdue(end, daysAfter(3)), null, 'kurz nach dem Urlaub noch nicht');
  assert.equal(retentionOverdue(end, daysAfter(RETENTION_DAYS)), null, 'am Stichtag selbst noch nicht');
  assert.equal(retentionOverdue(end, daysAfter(RETENTION_DAYS + 5)), RETENTION_DAYS + 5);
  assert.equal(retentionOverdue('', daysAfter(99)), null, 'ohne Enddatum keine Frist');
});

test('die Erklärung benennt Verantwortlichen, Auftragsverarbeiter und Speicherort', () => {
  const cloud = privacySections({ contact: 'Kim Beispiel, kim@example.org', region: 'nam5', mode: 'cloud' });
  const text = cloud.map((s) => `${s.title}\n${s.text}`).join('\n');

  assert.ok(text.includes('Kim Beispiel'), 'der Verantwortliche steht drin');
  assert.ok(text.includes('Art. 28'), 'Google ist als Auftragsverarbeiter benannt');
  assert.ok(text.includes('Drittland'), 'die US-Region ist als Übermittlung benannt');
  assert.ok(text.includes(String(RETENTION_DAYS)), 'die Aufbewahrungsfrist steht drin');
  assert.ok(text.includes('Art. 15–21'), 'die Betroffenenrechte stehen drin');

  const local = privacySections({ mode: 'local' });
  const localText = local.map((s) => s.text).join('\n');
  assert.ok(localText.includes('verlässt kein Eintrag dieses Gerät'), 'ohne Cloud wird nichts übertragen');
  assert.ok(localText.includes('privacyContact'), 'fehlt der Verantwortliche, sagt die App das');
});

test('ohne Konto steht nichts über ein Konto in der Erklärung', () => {
  // Eine Erklärung, die eine Verarbeitung beschreibt, die gar nicht
  // stattfindet, ist keine bessere Erklärung — sie ist eine falsche.
  const sections = privacySections({ mode: 'local', account: false });
  assert.equal(sections.find((s) => s.title === 'Das Konto'), undefined);
  const text = sections.map((s) => s.text).join(' ');
  assert.doesNotMatch(text, /E-Mail-Adresse/, 'ohne Konto wird keine Adresse verarbeitet');
});

test('mit Konto steht die Übermittlung in die USA ausdrücklich da', () => {
  // Der Punkt, an dem sich die App sonst selbst widerspräche: die Kasse liegt
  // in der EU, das Konto nicht. Wer nur „Daten bleiben in der EU“ liest,
  // bekäme eine Zusicherung, die für die Anmeldedaten nicht gilt.
  const sections = privacySections({ mode: 'cloud', region: 'eur3', account: true });
  const konto = sections.find((s) => s.title === 'Das Konto');
  assert.ok(konto, 'es gibt einen Abschnitt zum Konto');
  assert.match(konto.text, /USA/);
  assert.match(konto.text, /Art\. 6 Abs\. 1 lit\. b/, 'Rechtsgrundlage steht dabei');
  assert.match(konto.text, /löschen/i, 'und der Weg zur Löschung');

  const ort = sections.find((s) => s.title === 'Wo die Daten liegen');
  assert.match(ort.text, /USA/, 'auch dort, wo sonst „bleibt in der EU“ steht');
});

test('das Löschrecht nennt das Konto nur, wenn es eins gibt', () => {
  const withAccount = privacySections({ mode: 'cloud', account: true }).find((s) => s.title === 'Eure Rechte');
  const without = privacySections({ mode: 'cloud', account: false }).find((s) => s.title === 'Eure Rechte');
  assert.match(withAccount.text, /Konto löschen/);
  assert.doesNotMatch(without.text, /Konto löschen/);
});
