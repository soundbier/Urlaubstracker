/** Bottom-Sheets, Rückfragen und kurze Meldungen. */
import { h, icon, replace, $, $$ } from '../dom.js';

let openCount = 0;

/**
 * Alle offenen Sheets, damit die Gerätesperre sie zumachen kann: in einem Sheet
 * stehen Beträge, Namen und im schlimmsten Fall die Beitrittsdaten — die dürfen
 * nicht hinter dem Sperrbildschirm liegen bleiben.
 */
const openSheets = new Set();

export function closeAllSheets() {
  for (const close of [...openSheets]) close(undefined);
}

/** Auch die kurze Meldung unten kann einen Betrag tragen — sie geht mit zu. */
export function hideToast() {
  $('#toast')?.classList.remove('is-visible');
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Sichtbar heißt hier: nimmt Platz ein. `offsetParent` taugt nicht — das Sheet liegt fixiert. */
function focusableIn(root) {
  return $$(FOCUSABLE, root).filter((el) => el.getClientRects().length > 0);
}

/**
 * Öffnet ein Sheet von unten. `build(close)` liefert den Inhalt; `close(wert)`
 * schließt es und löst das zurückgegebene Promise mit `wert` auf.
 */
export function openSheet({ title, subtitle, build, fullHeight = false, bodyClass = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const opener = document.activeElement;

    const close = (value) => {
      if (done) return;
      done = true;
      openSheets.delete(close);
      overlay.classList.remove('is-open');
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.body.classList.remove('has-sheet');
      removeEventListener('keydown', onKey, true);
      setTimeout(() => overlay.remove(), 220);
      // Zurück auf den Knopf, der das Sheet geöffnet hat — sonst beginnt die
      // Tastaturbedienung danach wieder ganz oben auf der Seite.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
      resolve(value);
    };

    const onKey = (e) => {
      // Liegt ein weiteres Sheet darüber, gehört ihm die Tastatur.
      if ($$('.overlay').at(-1) !== overlay) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        close(undefined);
        return;
      }
      if (e.key !== 'Tab') return;

      // Solange das Sheet offen ist, bleibt der Fokus darin. Ohne das wandert
      // Tab hinter das Sheet, wo nichts zu sehen und alles bedienbar ist.
      const items = focusableIn(panel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const panel = h(
      'div.sheet',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog', class: fullHeight ? 'sheet--tall' : '' },
      h(
        'header.sheet__head',
        h('div', h('h2.sheet__title', title || ''), subtitle ? h('p.sheet__sub', subtitle) : null),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Schließen', onclick: () => close(undefined) }, icon('close', 22)),
      ),
      h('div.sheet__body', { class: bodyClass }, build(close)),
    );

    const overlay = h('div.overlay', {
      onclick: (e) => {
        if (e.target === overlay) close(undefined);
      },
    }, panel);

    document.body.append(overlay);
    document.body.classList.add('has-sheet');
    openCount++;
    openSheets.add(close);
    // In der Erfassungsphase, damit die Falle auch dann greift, wenn der Fokus
    // gerade in einem Feld sitzt, das Tab selbst behandelt.
    addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      const focusable = $('input, button, select, textarea', panel);
      if (focusable && !focusable.classList.contains('icon-btn')) focusable.focus({ preventScroll: true });
    });
  });
}

/** Ja/Nein-Rückfrage. Löst mit `true` auf, wenn bestätigt wurde. */
export function confirmSheet({ title, text, confirmLabel = 'Ja, machen', cancelLabel = 'Abbrechen', danger = false }) {
  return openSheet({
    title,
    build: (close) =>
      h(
        'div.confirm',
        text ? h('p.confirm__text', text) : null,
        h(
          'div.confirm__actions',
          h('button.btn.btn--ghost', { type: 'button', onclick: () => close(false) }, cancelLabel),
          // Bei einer Rückfrage ist die Bestätigung die Handlung — auch die
          // gefährliche. Ein Umriss neben einem Umriss lässt offen, welcher
          // Knopf der Knopf ist.
          h('button.btn.btn--primary', { type: 'button', class: danger ? 'btn--danger' : '', onclick: () => close(true) }, confirmLabel),
        ),
      ),
  }).then((v) => v === true);
}

/**
 * Nach einem einzelnen Text fragen — ein Name, mehr nicht.
 *
 * Löst mit dem eingetippten Text auf, oder mit `null`, wenn abgebrochen wurde.
 * `validate` bekommt den bereinigten Text und gibt eine Meldung zurück, wenn
 * etwas dagegen spricht.
 */
export function promptSheet({
  title,
  subtitle = '',
  label = 'Name',
  placeholder = '',
  value = '',
  confirmLabel = 'Übernehmen',
  maxlength = 30,
  validate = null,
}) {
  return openSheet({
    title,
    subtitle,
    build: (close) => {
      const input = h('input.field__input', { type: 'text', value, placeholder, maxlength, enterkeyhint: 'done', autocomplete: 'off' });
      const error = h('p.field__error');
      const go = () => {
        const text = input.value.trim();
        const problem = text ? validate?.(text) : 'Bitte etwas eintragen.';
        if (problem) {
          error.textContent = problem;
          input.focus();
          return;
        }
        close(text);
      };
      return h('form.stack', { onsubmit: (e) => { e.preventDefault(); go(); } },
        h('label.field', h('span.field__label', label), input),
        error,
        h('button.btn.btn--primary.btn--wide', { type: 'submit' }, confirmLabel),
      );
    },
  }).then((v) => (typeof v === 'string' ? v : null));
}

let toastTimer = null;

/**
 * Kurze Meldung am unteren Rand.
 *
 * `action` hängt einen Knopf daneben — gedacht für „Rückgängig“. Damit
 * kostet ein Vertipper einen Tipp statt: Zeile suchen, öffnen, löschen,
 * bestätigen. Mit Knopf steht die Meldung länger, sonst ist sie weg, bevor
 * man sie gelesen hat.
 */
export function toast(message, { type = 'info', duration = null, action = null } = {}) {
  let host = $('#toast');
  if (!host) {
    // Die Kennung gehört in die Attribute: `h` kennt nur Klassen im Tag-Namen.
    host = h('div.toast', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const hide = () => host.classList.remove('is-visible');

  host.className = `toast toast--${type} is-visible`;
  // `replace` statt `replaceChildren`: es wirft leere Kinder weg, statt aus
  // einem fehlenden Knopf das Wort „null“ zu machen.
  replace(host,
    h('span.toast__text', message),
    action
      ? h('button.toast__action', {
          type: 'button',
          onclick: () => {
            clearTimeout(toastTimer);
            hide();
            action.onClick();
          },
        }, action.label)
      : null,
  );

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, duration ?? (action ? 6000 : 3200));
}
