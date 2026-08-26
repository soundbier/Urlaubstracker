/** Bottom-Sheets, Rückfragen und kurze Meldungen. */
import { h, icon, $ } from '../dom.js';

let openCount = 0;

/**
 * Öffnet ein Sheet von unten. `build(close)` liefert den Inhalt; `close(wert)`
 * schließt es und löst das zurückgegebene Promise mit `wert` auf.
 */
export function openSheet({ title, subtitle, build, fullHeight = false }) {
  return new Promise((resolve) => {
    let done = false;

    const close = (value) => {
      if (done) return;
      done = true;
      overlay.classList.remove('is-open');
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.body.classList.remove('has-sheet');
      removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 220);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(undefined);
      }
    };

    const panel = h(
      'div.sheet',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog', class: fullHeight ? 'sheet--tall' : '' },
      h('div.sheet__grip', { 'aria-hidden': 'true' }),
      h(
        'header.sheet__head',
        h('div', h('h2.sheet__title', title || ''), subtitle ? h('p.sheet__sub', subtitle) : null),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Schließen', onclick: () => close(undefined) }, icon('close', 22)),
      ),
      h('div.sheet__body', build(close)),
    );

    const overlay = h('div.overlay', {
      onclick: (e) => {
        if (e.target === overlay) close(undefined);
      },
    }, panel);

    document.body.append(overlay);
    document.body.classList.add('has-sheet');
    openCount++;
    addEventListener('keydown', onKey);
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
          h('button.btn', { type: 'button', class: danger ? 'btn--danger' : 'btn--primary', onclick: () => close(true) }, confirmLabel),
        ),
      ),
  }).then((v) => v === true);
}

let toastTimer = null;

export function toast(message, { type = 'info', duration = 3200 } = {}) {
  let host = $('#toast');
  if (!host) {
    host = h('div#toast.toast', { role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  host.className = `toast toast--${type} is-visible`;
  host.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('is-visible'), duration);
}
