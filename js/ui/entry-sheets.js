/** Die beiden Eingabemasken: Ausgabe erfassen und Einzahlung eintragen. */
import { h, icon } from '../dom.js';
import { openSheet } from './sheet.js';
import { CATEGORIES, POT, parseAmount, todayISO, addDays } from '../calc.js';
import { money, dayLabel, fullDate } from '../format.js';

/**
 * Zahlenfeld mit eigener Tastatur.
 *
 * Auf dem Handy ist die Systemtastatur für Beträge unangenehm: sie verdeckt
 * das halbe Sheet und der Komma-Punkt sitzt je nach Layout woanders. Diese
 * hier hat große Ziffern und genau eine Komma-Taste.
 */
function amountField(initialCents, currency) {
  let raw = initialCents ? String(initialCents / 100).replace('.', ',') : '';

  const display = h('div.amount__value');
  const hint = h('div.amount__hint');

  const render = () => {
    const [intPart, decPart] = raw.split(',');
    const grouped = intPart ? Number(intPart).toLocaleString('de-DE') : '0';
    display.textContent = raw === '' ? '0' : raw.includes(',') ? `${grouped},${decPart}` : grouped;
    display.classList.toggle('is-empty', raw === '');
    const cents = parseAmount(raw);
    hint.textContent = cents ? money(cents, currency) : 'Betrag eingeben';
  };

  const press = (key) => {
    if (key === 'del') raw = raw.slice(0, -1);
    else if (key === ',') {
      if (!raw.includes(',')) raw = (raw || '0') + ',';
    } else {
      const [, dec] = raw.split(',');
      if (dec !== undefined && dec.length >= 2) return;
      if (!raw.includes(',') && raw.replace(/\D/g, '').length >= 7) return;
      raw = raw === '0' ? key : raw + key;
    }
    render();
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const key = (label, value, cls = '') =>
    h('button.key', { type: 'button', class: cls, onclick: () => press(value), 'aria-label': value === 'del' ? 'Löschen' : label },
      value === 'del' ? icon('back', 22) : label);

  const pad = h('div.keypad',
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, d)),
    key(',', ',', 'key--muted'),
    key('0', '0'),
    key('', 'del', 'key--muted'),
  );

  render();
  return {
    el: h('div.amount', h('div.amount__row', display, h('span.amount__cur', currency === 'EUR' ? '€' : currency)), hint, pad),
    getCents: () => parseAmount(raw),
    focusHint: hint,
  };
}

function chipRow(options, selectedId, onSelect) {
  const row = h('div.chips');
  const buttons = options.map((o) => {
    const b = h('button.chip', { type: 'button', onclick: () => {
      selectedId = o.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === selectedId));
      onSelect(o.id);
    }, dataset: { id: o.id } }, o.icon ? h('span.chip__icon', o.icon) : null, o.label);
    b.classList.toggle('is-active', o.id === selectedId);
    return b;
  });
  row.append(...buttons);
  return row;
}

function dateRow(value, onChange) {
  const today = todayISO();
  const input = h('input.field__input', { type: 'date', value, onchange: (e) => { value = e.target.value || today; sync(); onChange(value); } });
  const label = h('div.daterow__label');

  const quick = (iso, text) =>
    h('button.chip', { type: 'button', dataset: { iso }, onclick: () => { value = iso; input.value = iso; sync(); onChange(iso); } }, text);

  const chips = [quick(today, 'Heute'), quick(addDays(today, -1), 'Gestern'), quick(addDays(today, -2), dayLabel(addDays(today, -2), today, { compact: true }))];

  function sync() {
    label.textContent = fullDate(value);
    chips.forEach((c) => c.classList.toggle('is-active', c.dataset.iso === value));
  }
  sync();

  return h('div.daterow',
    h('div.chips', ...chips, h('label.chip.chip--date', icon('calendar', 17), 'Datum', input)),
    label,
  );
}

function field(labelText, control) {
  return h('label.field', h('span.field__label', labelText), control);
}

/**
 * Ausgabe anlegen oder bearbeiten.
 * Gibt `{ action: 'save', values }`, `{ action: 'delete' }` oder `undefined` zurück.
 */
export function expenseSheet({ trip, expense = null, defaults = {} }) {
  const editing = Boolean(expense);
  let category = expense?.category || defaults.category || 'food';
  let date = expense?.date || defaults.date || todayISO();
  let payer = expense?.payer || defaults.payer || POT;
  const amount = amountField(expense?.amount || 0, trip.currency);
  const note = h('input.field__input', { type: 'text', value: expense?.note || '', placeholder: 'z. B. Abendessen am Hafen', maxlength: 120, enterkeyhint: 'done' });

  const payers = [{ id: POT, label: 'Kasse', icon: '👛' }, ...trip.people.map((p) => ({ id: p.id, label: p.name, icon: '👤' }))];

  return openSheet({
    title: editing ? 'Ausgabe bearbeiten' : 'Was habt ihr ausgegeben?',
    fullHeight: true,
    build: (close) => {
      const save = () => {
        const cents = amount.getCents();
        if (!cents) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        close({ action: 'save', values: { amount: cents, date, category, payer, note: note.value } });
      };

      return h('form.entry', { onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Wofür?', chipRow(CATEGORIES.map((c) => ({ id: c.id, label: c.short, icon: c.icon })), category, (id) => { category = id; })),
        field('Wann?', dateRow(date, (iso) => { date = iso; })),
        field('Bezahlt von', chipRow(payers, payer, (id) => { payer = id; })),
        field('Notiz', note),
        h('div.entry__actions',
          editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
          h('button.btn.btn--primary.btn--wide', { type: 'submit' }, icon('check', 20), editing ? 'Speichern' : 'Eintragen'),
        ),
      );
    },
  });
}

/** Einzahlung aufs gemeinsame Konto. */
export function contributionSheet({ trip, contribution = null, defaults = {} }) {
  const editing = Boolean(contribution);
  let personId = contribution?.personId || defaults.personId || trip.people[0]?.id;
  let date = contribution?.date || defaults.date || todayISO();
  const amount = amountField(contribution?.amount || 0, trip.currency);
  const note = h('input.field__input', { type: 'text', value: contribution?.note || '', placeholder: 'z. B. Überweisung vom 12.6.', maxlength: 120 });

  return openSheet({
    title: editing ? 'Einzahlung bearbeiten' : 'Geld eingezahlt',
    subtitle: 'Was ist auf das gemeinsame Urlaubskonto gegangen?',
    fullHeight: true,
    build: (close) => {
      const save = () => {
        const cents = amount.getCents();
        if (!cents) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        close({ action: 'save', values: { amount: cents, date, personId, note: note.value } });
      };

      return h('form.entry', { onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Von wem?', chipRow(trip.people.map((p) => ({ id: p.id, label: p.name, icon: '👤' })), personId, (id) => { personId = id; })),
        field('Wann?', dateRow(date, (iso) => { date = iso; })),
        field('Notiz', note),
        h('div.entry__actions',
          editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
          h('button.btn.btn--primary.btn--wide', { type: 'submit' }, icon('check', 20), editing ? 'Speichern' : 'Eintragen'),
        ),
      );
    },
  });
}
