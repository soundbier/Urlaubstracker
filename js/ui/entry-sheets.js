/** Die beiden Eingabemasken: Ausgabe erfassen und Einzahlung eintragen. */
import { h, icon } from '../dom.js';
import { openSheet } from './sheet.js';
import { CATEGORIES, POT, parseAmount, todayISO, addDays } from '../calc.js';
import { money, dayLabel, fullDate } from '../format.js';

/**
 * Der zuletzt gewählte Zahler — nur für diese Sitzung, bewusst nicht in den
 * Einstellungen.
 *
 * Wer am Markt drei Sachen hintereinander aus der eigenen Tasche zahlt, soll
 * das nicht dreimal umstellen müssen. Über einen App-Neustart hinaus darf sich
 * das aber nicht merken: ein stehengebliebenes „Anna“ vom Vortag würde die
 * Endabrechnung still verfälschen, ohne dass jemand es bemerkt. Deshalb steht
 * die Wahl auch immer in der Zusammenfassung der Detailzeile.
 */
let lastPayer = POT;

/** `1050` → `"10,50"`, `1000` → `"10"`, `0` → `""` — so, wie man es eintippen würde. */
function centsToRaw(cents) {
  if (!cents) return '';
  const s = (Math.abs(cents) / 100).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s.replace('.', ',');
}

/**
 * Zahlenfeld mit eigener Tastatur.
 *
 * Auf dem Handy ist die Systemtastatur für Beträge unangenehm: sie verdeckt
 * das halbe Sheet und der Komma-Punkt sitzt je nach Layout woanders. Diese
 * hier hat große Ziffern und genau eine Komma-Taste.
 */
function amountField(initialCents, currency) {
  let raw = centsToRaw(initialCents);

  const display = h('div.amount__value');
  const hint = h('div.amount__hint');

  const render = () => {
    const [intPart, decPart] = raw.split(',');
    const grouped = intPart ? Number(intPart).toLocaleString('de-DE') : '0';
    display.textContent = raw === '' ? '0' : raw.includes(',') ? `${grouped},${decPart}` : grouped;
    display.classList.toggle('is-empty', raw === '');
    const cents = parseAmount(raw);
    hint.textContent = cents > 0 ? money(cents, currency) : 'Betrag eingeben';
    // Wer nach der Fehlermeldung weitertippt, hat sie beantwortet.
    hint.classList.remove('is-error');
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

/**
 * Die sechs Kategorien als festes 3×2-Raster.
 *
 * Als frei umbrechende Chips ergaben sie drei ungleich lange Reihen: viel
 * Platz für wenig Inhalt, und die Zeilen sprangen je nach Wortlänge. Gleich
 * breite Felder sind ruhiger, immer an derselben Stelle — man trifft „Essen“
 * irgendwann ohne hinzusehen — und sparen die Höhe, die es braucht, damit die
 * Detailzeile darunter noch anstupst.
 */
function categoryGrid(selectedId, onSelect) {
  const grid = h('div.catgrid');
  const buttons = CATEGORIES.map((c) => {
    const b = h('button.chip.catgrid__item', { type: 'button', dataset: { id: c.id }, onclick: () => {
      selectedId = c.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === selectedId));
      onSelect(c.id);
    } }, icon(c.icon, 16), c.short);
    b.classList.toggle('is-active', c.id === selectedId);
    return b;
  });
  grid.append(...buttons);
  return grid;
}

function chipRow(options, selectedId, onSelect) {
  const row = h('div.chips');
  const buttons = options.map((o) => {
    const b = h('button.chip', { type: 'button', onclick: () => {
      selectedId = o.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === selectedId));
      onSelect(o.id);
    }, dataset: { id: o.id } }, o.icon ? icon(o.icon, 16) : null, o.label);
    b.classList.toggle('is-active', o.id === selectedId);
    return b;
  });
  row.append(...buttons);
  return row;
}

/**
 * Datumszeile mit Schnellwahl. `withTomorrow` blendet zusätzlich „Morgen“ ein —
 * gebraucht wird das nur dort, wo auch in die Zukunft geplant werden kann.
 * Gibt neben dem Element ein `set` zurück, damit die Maske das Datum auch von
 * außen umstellen kann.
 */
function dateRow(value, onChange, { withTomorrow = false } = {}) {
  const today = todayISO();
  const input = h('input.field__input', { type: 'date', value, onchange: (e) => { value = e.target.value || today; sync(); onChange(value); } });
  const label = h('div.daterow__label');

  const quick = (iso, text) =>
    h('button.chip', { type: 'button', dataset: { iso }, onclick: () => { set(iso); onChange(iso); } }, text);

  const chips = [
    quick(today, 'Heute'),
    quick(addDays(today, -1), 'Gestern'),
    withTomorrow ? quick(addDays(today, 1), 'Morgen') : quick(addDays(today, -2), dayLabel(addDays(today, -2), today, { compact: true })),
  ];

  function sync() {
    label.textContent = fullDate(value);
    chips.forEach((c) => c.classList.toggle('is-active', c.dataset.iso === value));
  }

  function set(iso) {
    value = iso;
    input.value = iso;
    sync();
  }
  sync();

  return {
    el: h('div.daterow',
      // Feste Spalten statt umbrechender Chips: sonst rutschte die Datumswahl
      // auf eine eigene Zeile und schob alles darunter aus dem Bild. Sie steht
      // hier nur als Kalendersymbol — das Wort „Datum“ passte daneben in keiner
      // Handybreite und wurde überall abgeschnitten.
      h('div.daterow__quick', ...chips,
        h('label.chip.chip--date', { title: 'Anderes Datum', 'aria-label': 'Anderes Datum' }, icon('calendar', 18), input)),
      label,
    ),
    set,
  };
}

function field(labelText, control) {
  return h('label.field', h('span.field__label', labelText), control);
}

/**
 * Aufklappbare Zeile für alles, was man selten anfasst.
 *
 * Die Zusammenfassung rechts ist der Preis dafür, dass hier etwas versteckt
 * wird: was drinsteht, muss auch zugeklappt ablesbar sein — sonst trägt man
 * eine Ausgabe auf den falschen Namen ein und merkt es erst bei der
 * Abrechnung. `<details>` statt eigener Knopflogik, damit Tastatur und
 * Screenreader ohne Zutun funktionieren.
 */
function disclosure(title, summaryEl, ...body) {
  return h('details.disclosure',
    h('summary.disclosure__head',
      h('span.disclosure__title', title),
      summaryEl,
      icon('chevron', 18),
    ),
    h('div.disclosure__body', ...body),
  );
}

/**
 * Ausgabe anlegen oder bearbeiten.
 * Gibt `{ action: 'save', values }`, `{ action: 'delete' }` oder `undefined` zurück.
 *
 * Die Reihenfolge folgt der Häufigkeit, nicht der Datenstruktur: Betrag,
 * Kategorie, Datum stehen offen da, alles Übrige liegt hinter „Details“. Damit
 * passt der Normalfall auf einen Handyschirm — vorher lag der Speichern-Knopf
 * gut 350 px unterhalb des Randes, und das für den einen Handgriff, den man
 * mehrmals am Tag macht.
 *
 * Eine Ausgabe kann „schon bezahlt“ oder „verplant“ sein. Verplant heißt: das
 * Geld ist fest eingeplant, aber noch nicht weg — es wird vom Tagesbudget
 * abgezogen, taucht aber weder in der Tagesausgabe noch in der Abrechnung auf.
 * Wer ein Datum in der Zukunft wählt, meint fast immer genau das; deshalb
 * springt die Umschaltung von allein um, solange man sie nicht selbst angefasst
 * hat — und die Detailzeile klappt dabei auf, damit die Umschaltung nicht
 * ungesehen passiert.
 */
export function expenseSheet({ trip, expense = null, defaults = {} }) {
  const editing = Boolean(expense);
  const today = todayISO();
  let category = expense?.category || defaults.category || 'food';
  let date = expense?.date || defaults.date || todayISO();
  // Beim Bearbeiten zählt, was am Eintrag steht; nur beim Neuanlegen springt
  // der zuletzt gewählte Zahler ein.
  let payer = expense?.payer || defaults.payer || (editing ? POT : lastPayer);
  let planned = expense ? expense.planned === true : defaults.planned === true || date > today;
  let plannedTouched = editing || defaults.planned !== undefined;
  const amount = amountField(expense?.amount || 0, trip.currency);
  const note = h('input.field__input', { type: 'text', value: expense?.note || '', placeholder: 'z. B. Abendessen am Hafen', maxlength: 120, enterkeyhint: 'done' });

  const payers = [{ id: POT, label: 'Kasse', icon: 'wallet' }, ...trip.people.map((p) => ({ id: p.id, label: p.name, icon: 'person' }))];
  const payerName = (id) => payers.find((p) => p.id === id)?.label || 'Kasse';

  return openSheet({
    title: editing ? 'Eintrag bearbeiten' : 'Was kostet euch das?',
    fullHeight: true,
    bodyClass: 'sheet__body--entry',
    build: (close) => {
      const save = () => {
        const cents = amount.getCents();
        if (!(cents > 0)) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        if (!editing) lastPayer = payer;
        close({
          action: 'save',
          values: {
            amount: cents, date, category, payer, note: note.value, planned,
            // Wer eine Vormerkung von Hand auf „bezahlt“ stellt, macht dasselbe
            // wie der Haken in der Liste: reserviert bleibt reserviert.
            fromPlan: planned ? false : expense?.planned === true || expense?.fromPlan === true,
          },
        });
      };

      const submit = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, icon('check', 20));
      const dateLabel = h('span.field__label');
      const payerLabelEl = h('span.field__label');
      const kindNote = h('p.field__note');
      const detailSummary = h('span.disclosure__summary');
      const when = dateRow(date, (iso) => {
        date = iso;
        // Ein künftiges Datum meint eine Vormerkung — außer man hat die
        // Umschaltung schon selbst bedient.
        if (!plannedTouched && iso > today !== planned) {
          setPlanned(iso > today);
          details.open = true;
        }
        syncKind();
      }, { withTomorrow: true });

      const kindButtons = [
        h('button.segmented__btn', { type: 'button', onclick: () => { plannedTouched = true; setPlanned(false); } }, 'Schon bezahlt'),
        h('button.segmented__btn', { type: 'button', onclick: () => { plannedTouched = true; setPlanned(true); } }, 'Verplant'),
      ];

      const details = disclosure('Details', detailSummary,
        h('div.field',
          h('span.field__label', 'Status'),
          h('div.segmented', ...kindButtons),
          kindNote,
        ),
        h('label.field', payerLabelEl, chipRow(payers, payer, (id) => { payer = id; syncKind(); })),
        field('Notiz', note),
      );

      function setPlanned(next) {
        planned = next;
        // „Schon bezahlt“ und ein Datum in der Zukunft passen nicht zusammen:
        // dann ist heute gemeint.
        if (!planned && date > today) { date = today; when.set(today); }
        syncKind();
      }

      function syncKind() {
        kindButtons[0].classList.toggle('is-active', !planned);
        kindButtons[1].classList.toggle('is-active', planned);
        dateLabel.textContent = planned ? 'Wann ist es fällig?' : 'Wann?';
        payerLabelEl.textContent = planned ? 'Wer zahlt das?' : 'Bezahlt von';
        kindNote.textContent = planned
          ? 'Wird vom verfügbaren Geld abgezogen, zählt aber erst als Ausgabe, wenn ihr sie als bezahlt eintragt.'
          : 'Ist bezahlt und zählt sofort zu den Ausgaben.';
        // Zugeklappt muss ablesbar bleiben, was drinsteht.
        detailSummary.textContent = planned ? `verplant · ${payerName(payer)}` : payerName(payer);
        submit.replaceChildren(icon('check', 20), editing ? 'Speichern' : planned ? 'Vormerken' : 'Eintragen');
      }
      syncKind();

      // Aufgeklappt startet die Zeile nur, wenn dort etwas steht, das jemanden
      // überraschen könnte — ein gemerkter Zahler, eine Vormerkung, eine Notiz.
      details.open = planned || payer !== POT || Boolean(note.value);

      return h('form.entry', { onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Wofür?', categoryGrid(category, (id) => { category = id; })),
        h('label.field', dateLabel, when.el),
        details,
        h('div.entry__actions',
          editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
          submit,
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
    bodyClass: 'sheet__body--entry',
    build: (close) => {
      const save = () => {
        const cents = amount.getCents();
        if (!(cents > 0)) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        close({ action: 'save', values: { amount: cents, date, personId, note: note.value } });
      };

      return h('form.entry', { onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Von wem?', chipRow(trip.people.map((p) => ({ id: p.id, label: p.name, icon: 'person' })), personId, (id) => { personId = id; })),
        field('Wann?', dateRow(date, (iso) => { date = iso; }).el),
        field('Notiz', note),
        h('div.entry__actions',
          editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
          h('button.btn.btn--primary.btn--wide', { type: 'submit' }, icon('check', 20), editing ? 'Speichern' : 'Eintragen'),
        ),
      );
    },
  });
}
