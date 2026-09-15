/**
 * Die kurze Meldung unten — und der „Rückgängig“-Knopf darin.
 *
 * Der Knopf ist der einzige Ort in der App, an dem ein einzelner Tipp ohne
 * Rückfrage einen Eintrag löscht. Solange die Meldung steht, ist das genau
 * richtig; verschwindet sie, muss er aufhören zu wirken. Das ging einmal
 * schief: ausgeblendet wurde nur die Durchsichtigkeit, das Element blieb
 * stehen — und ein durchsichtiger Knopf ist immer noch ein Knopf. Wer danach
 * irgendwo in der Mitte der Liste hintippte, löschte die zuletzt eingetragene
 * Ausgabe, ohne dass irgendetwas darauf hindeutete.
 *
 * Zwei Riegel, zwei Prüfungen: der Knopf selbst weist einen Tipp ab, wenn die
 * Meldung nicht mehr steht, und das Stylesheet nimmt ihn per `visibility` aus
 * dem Bild. Der zweite lässt sich hier nur am Text des Stylesheets prüfen —
 * ohne Layout gibt es kein „liegt darüber“.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installFakeDom } from './helpers/fake-dom.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Der Toast hält sich einen Zeitgeber über Sekunden — der hielte den
// Testlauf genauso lange offen. `unref` nimmt ihm nur das Recht, den Prozess
// wachzuhalten; laufen tut er normal weiter.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => {
  const t = realSetTimeout(fn, ms);
  t.unref?.();
  return t;
};

const document = installFakeDom();
const { toast, hideToast } = await import('../js/ui/sheet.js');

const undoButton = () => document.querySelector('.toast__action');

test('solange die Meldung steht, wirkt „Rückgängig“', () => {
  let undone = 0;
  toast('12,50 € eingetragen', { type: 'success', action: { label: 'Rückgängig', onClick: () => { undone += 1; } } });

  const button = undoButton();
  assert.ok(button, 'der Knopf steht neben der Meldung');
  button.click();
  assert.equal(undone, 1);
});

test('die ausgeblendete Meldung löscht nichts mehr', () => {
  let undone = 0;
  toast('12,50 € eingetragen', { type: 'success', action: { label: 'Rückgängig', onClick: () => { undone += 1; } } });

  const button = undoButton();
  // So blendet die App aus: beim Zusperren, nach Ablauf der Zeit, und nach
  // einem ersten Tipp. In allen drei Fällen bleibt das Element stehen.
  hideToast();
  button.click();
  assert.equal(undone, 0, 'ein Tipp auf den unsichtbaren Knopf darf nichts auslösen');
});

test('zweimal antippen löst nur einmal aus', () => {
  let undone = 0;
  toast('12,50 € eingetragen', { type: 'success', action: { label: 'Rückgängig', onClick: () => { undone += 1; } } });

  const button = undoButton();
  button.click();
  button.click();
  assert.equal(undone, 1, 'nach dem ersten Tipp ist die Meldung weg — und mit ihr der Knopf');
});

test('das Stylesheet nimmt die ausgeblendete Meldung wirklich aus dem Bild', async () => {
  const css = await readFile(join(root, 'styles.css'), 'utf8');
  const rule = (selector) => {
    const at = css.indexOf(`\n${selector} {`);
    assert.notEqual(at, -1, `${selector} steht im Stylesheet`);
    return css.slice(at, css.indexOf('}', at));
  };

  // `opacity: 0` allein macht ein Element unsichtbar, aber nicht unantastbar —
  // und `pointer-events: none` am Toast rettet das nicht, weil `.toast__action`
  // es darin wieder auf `auto` setzt (sonst ließe der Knopf sich gar nicht
  // drücken). Nur `visibility` nimmt den ganzen Zweig aus der Trefferprüfung.
  assert.match(rule('.toast'), /visibility:\s*hidden/, 'ausgeblendet ist auch unsichtbar geschaltet');
  assert.match(rule('.toast.is-visible'), /visibility:\s*visible/, 'sichtbar wird es wieder zurückgenommen');
  assert.match(rule('.toast__action'), /pointer-events:\s*auto/, 'der Knopf bleibt der einzige anfassbare Teil');
});
