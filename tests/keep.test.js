/**
 * Was beim Neuaufbau einer Ansicht erhalten bleiben muss.
 *
 * Der Fall, um den es geht, lässt sich am Schreibtisch kaum herstellen und im
 * Urlaub ständig: jemand tippt eine Notiz, und im selben Moment trifft vom
 * Handy nebenan eine Änderung ein. Die Ansicht wird neu gebaut, das Feld ist
 * ein anderes — und der Finger steht im Nichts.
 *
 * Geprüft wird deshalb an nachgebauten Bäumen, was `ui/keep.js` allein
 * entscheidet: Findet es das Feld wieder, auch wenn darüber inzwischen eine
 * Zeile dazugekommen ist? Und lässt es die Finger davon, wenn es sich seiner
 * Sache nicht sicher sein kann?
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const document = installFakeDom();
const { h, replace } = await import('../js/dom.js');
const { capture, restore } = await import('../js/ui/keep.js');

/** Ein Feld, wie es in den Ansichten steht. */
const field = (props = {}) => h('input.field__input', { type: 'text', ...props });

/** Eine Ansicht: ein paar Zeilen, dazwischen das Feld. */
function view({ rows = 1, field: input = field() } = {}) {
  return h('div.view',
    h('div.list', ...Array.from({ length: rows }, (_, i) => h('div.row', `Zeile ${i + 1}`))),
    h('div.field', input),
  );
}

/** Wie die App es tut: das Alte raus, das Neue rein (siehe `dom.replace`). */
function mount(node) {
  replace(document.body, node);
  return node;
}

test('die Schreibmarke kommt nach dem Neuaufbau zurück', () => {
  const before = mount(view());
  const input = before.querySelector('.field__input');
  input.value = 'Eis am Strand';
  input.selectionStart = 3;
  input.selectionEnd = 3;
  input.focus();

  const kept = capture(document.body);
  const after = mount(view());
  restore(document.body, kept);

  const next = after.querySelector('.field__input');
  assert.equal(document.activeElement, next, 'der Fokus steht wieder im Feld');
  assert.equal(next.selectionStart, 3, 'und an derselben Stelle im Wort');
  assert.equal(next.selectionEnd, 3);
});

test('eine Zeile mehr über dem Feld ändert daran nichts', () => {
  // Genau der Fall aus der Gruppe: die Ausgabe von nebenan steht jetzt in der
  // Liste, das Feld ist im Baum nach unten gerutscht.
  const before = mount(view({ rows: 2 }));
  before.querySelector('.field__input').focus();

  const kept = capture(document.body);
  const after = mount(view({ rows: 3 }));
  restore(document.body, kept);

  assert.equal(document.activeElement, after.querySelector('.field__input'));
});

test('von zwei gleichen Feldern bleibt es dasselbe', () => {
  const two = () => h('div.view', h('div.field', field()), h('div.field', field()));

  const before = mount(two());
  before.querySelectorAll('.field__input')[1].focus();

  const kept = capture(document.body);
  const after = mount(two());
  restore(document.body, kept);

  const fields = after.querySelectorAll('.field__input');
  assert.equal(document.activeElement, fields[1], 'das zweite bleibt das zweite');
  assert.notEqual(document.activeElement, fields[0]);
});

test('ist das Feld verschwunden, wird nichts fokussiert', () => {
  const before = mount(view());
  before.querySelector('.field__input').focus();

  const kept = capture(document.body);
  const after = mount(h('div.view', h('div.list', h('div.row', 'nur noch Zeilen'))));
  document.activeElement = null;
  restore(document.body, kept);

  assert.equal(document.activeElement, null, 'lieber gar kein Fokus als der falsche');
  assert.ok(after);
});

test('ein anderes Feld an derselben Stelle bekommt den Fokus nicht', () => {
  // Der gefährliche Fall: die Stelle im Baum stimmt, das Feld ist ein
  // anderes. Ein Passwort, in das die Schreibmarke aus einem Notizfeld
  // springt, wäre schlimmer als gar kein Fokus.
  const before = mount(view());
  before.querySelector('.field__input').focus();

  const kept = capture(document.body);
  mount(view({ field: field({ type: 'password', name: 'join' }) }));
  document.activeElement = null;
  restore(document.body, kept);

  assert.equal(document.activeElement, null);
});

test('was stehen geblieben ist, wird nicht angefasst', () => {
  // Der Fall aus der Navigation: die Leiste wird nicht neu gebaut, nur ihre
  // Markierung wandert — und damit passt die Beschreibung des angetippten
  // Knopfes plötzlich auf seinen Nachbarn. Wer hier nach der Beschreibung
  // sucht, setzt den Fokus einen Knopf weiter.
  const first = h('button.nav__item', 'Heute');
  const second = h('button.nav__item', 'Finanzen');
  mount(h('nav.nav', first, second));
  first.focus();

  const kept = capture(document.body);
  first.className = 'nav__item is-active'; // der Reiter ist jetzt aufgeschlagen
  restore(document.body, kept);

  assert.equal(document.activeElement, first, 'der Fokus bleibt auf dem angetippten Knopf');
});

test('die Kategorieleiste bleibt, wo sie hingeschoben wurde', () => {
  const strip = () => h('div.tabs', h('button.tab', 'Alles'), h('button.tab', 'Essen'));

  const before = mount(h('div.view', strip()));
  before.querySelector('.tabs').scrollLeft = 120;

  const kept = capture(document.body);
  const after = mount(h('div.view', strip()));
  restore(document.body, kept);

  assert.equal(after.querySelector('.tabs').scrollLeft, 120);
});

test('ohne Fokus und ohne verschobene Leiste passiert nichts', () => {
  mount(view());
  document.activeElement = null;

  const kept = capture(document.body);
  assert.equal(kept.focus, null);
  assert.deepEqual(kept.scroll, []);

  const after = mount(view());
  restore(document.body, kept);
  assert.equal(document.activeElement, null);
  assert.ok(after);
});
