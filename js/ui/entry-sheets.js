/** Die Eingabemasken: Ausgabe, Einzahlung, Bargeld, Programmpunkt, Packliste. */
import { h, icon, replace } from '../dom.js';
import { openSheet } from './sheet.js';
import { disclosure } from './parts.js';
import {
  CATEGORIES, POT, parseAmount, todayISO, addDays, isValidDate, daysInclusive, cashPayerFor, isCashPayer, cashPayerPerson,
  PACK_CATEGORIES, PACK_STATUSES, PACK_BAGS, PACK_QTY_MAX, PACK_SCOPES,
  packCategory, packStatus, packBag, packSub, packSubs, packQty, packItemShared,
  PLAN_CATEGORIES, planSub, planSubs,
} from '../calc.js';
import { money, days, dayLabel, fullDate } from '../format.js';

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

/**
 * Die Speichern-Zeile einer Eingabemaske steht in einer eigenen Fußzeile,
 * außerhalb des `<form>`-Elements (siehe `openSheet` in `sheet.js`) — nur so
 * bleibt sie sichtbar, ohne je den scrollenden Bereich zu verdecken. Den
 * Absende-Knopf trotzdem zum Formular gehören zu lassen (Enter im Notizfeld
 * etc.), braucht dafür eine Formular-`id`, auf die der Knopf per
 * `form`-Attribut zeigt — und die muss je offener Maske einmalig sein.
 */
let formSeq = 0;
const nextFormId = () => `entry-form-${++formSeq}`;

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
 * Die Kategorien als festes Raster mit drei Spalten.
 *
 * Als frei umbrechende Chips ergaben sie drei ungleich lange Reihen: viel
 * Platz für wenig Inhalt, und die Zeilen sprangen je nach Wortlänge. Gleich
 * breite Felder sind ruhiger, immer an derselben Stelle — man trifft „Essen“
 * irgendwann ohne hinzusehen — und sparen die Höhe, die es braucht, damit die
 * Detailzeile darunter noch anstupst.
 *
 * `list` ist voreingestellt die Ausgaben-Kategorie; die Packliste bringt ihre
 * eigene mit (siehe `PACK_CATEGORIES`) und stellt ihre Sorten in dasselbe
 * Raster — dreizehn frei umbrechende Chips waren fünf ungleiche Reihen und
 * schoben alles Weitere aus der Maske. Ein Symbol haben die Sorten nicht; das
 * Feld bleibt dann einfach leer statt einen Platzhalter zu tragen.
 */
function categoryGrid(selectedId, onSelect, list = CATEGORIES) {
  const grid = h('div.catgrid');
  const buttons = list.map((c) => {
    const b = h('button.chip.catgrid__item', { type: 'button', dataset: { id: c.id }, onclick: () => {
      selectedId = c.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === selectedId));
      onSelect(c.id);
    } }, c.icon ? icon(c.icon, 16) : null, h('span.catgrid__label', c.short || c.label));
    b.classList.toggle('is-active', c.id === selectedId);
    return b;
  });
  grid.append(...buttons);
  return grid;
}

/**
 * Eine Reihe zur Auswahl. Personen tragen ihren Farbpunkt statt eines
 * Personen-Symbols: dieselbe Farbe steht in der Liste, in der Aufteilung und
 * in der Abrechnung neben demselben Namen — fünfmal dasselbe graue Männchen
 * sagt dagegen nur, dass hier Personen stehen, was ohnehin dransteht.
 */
function chipRow(options, selectedId, onSelect) {
  const row = h('div.chips');
  const buttons = options.map((o) => {
    const b = h('button.chip', { type: 'button', onclick: () => {
      selectedId = o.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === selectedId));
      onSelect(o.id);
    }, dataset: { id: o.id } },
      o.icon ? icon(o.icon, 16) : o.dot ? h('span.dot', { style: { background: o.dot } }) : null,
      o.label);
    b.classList.toggle('is-active', o.id === selectedId);
    return b;
  });
  row.append(...buttons);
  return row;
}

/**
 * Die Anzahl als Stufenschalter, nicht als Zahlenfeld.
 *
 * Es geht hier fast immer um zwei bis sechs — dafür ist ein Tastenfeld zu
 * viel Weg, und die Tastatur des Geräts hätte sich über die halbe Maske
 * gelegt. Derselbe Schalter wie bei den Kostenanteilen unter „Reisegruppe“:
 * zwei Knöpfe, eine Zahl, keine Eingabe, die leer bleiben kann.
 */
function qtyStepper(value, onChange) {
  const out = h('span.stepper__value', String(value));
  const set = (n) => {
    value = Math.max(1, Math.min(PACK_QTY_MAX, n));
    out.textContent = String(value);
    sync();
    onChange(value);
  };
  const minus = h('button.stepper__btn', { type: 'button', 'aria-label': 'Eins weniger', onclick: () => set(value - 1) }, '−');
  const plus = h('button.stepper__btn', { type: 'button', 'aria-label': 'Eins mehr', onclick: () => set(value + 1) }, '+');
  const sync = () => {
    minus.disabled = value <= 1;
    plus.disabled = value >= PACK_QTY_MAX;
  };
  sync();
  return h('div.stepper.stepper--qty', minus, out, plus);
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
 * Ausgabe anlegen oder bearbeiten.
 * Gibt `{ action: 'save', values }`, `{ action: 'delete' }` oder `undefined` zurück.
 *
 * Die Reihenfolge folgt der Häufigkeit, nicht der Datenstruktur: Betrag,
 * Kategorie, Datum und Zahler stehen offen da, nur Status und Notiz liegen
 * hinter „Details“. Der Zahler stand früher mit dort drin — aber wer aus
 * eigener Tasche oder mit schon ausgezahltem Bargeld zahlt statt aus der
 * Kasse, will das in der Regel bei jedem Eintrag angeben, nicht nur
 * gelegentlich; hinter einer zugeklappten Zeile war das leicht zu übersehen.
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
  // Ob eine Person aus eigener Tasche oder aus ihrem Bargeld zahlt, merkt sich
  // getrennt vom Namen — wechselt man die Person, bleibt die zuletzt gewählte
  // Geldform stehen, statt bei jedem Tipp auf „privat“ zurückzuspringen.
  let payKind = isCashPayer(payer) ? 'cash' : 'private';
  let planned = expense ? expense.planned === true : defaults.planned === true || date > today;
  let plannedTouched = editing || defaults.planned !== undefined;
  const amount = amountField(expense?.amount || 0, trip.currency);
  const note = h('input.field__input', { type: 'text', value: expense?.note || '', placeholder: 'z. B. Abendessen am Hafen', maxlength: 120, enterkeyhint: 'done' });

  const payers = [{ id: POT, label: 'Kasse', icon: 'wallet' }, ...trip.people.map((p) => ({ id: p.id, label: p.name, dot: p.color }))];
  // Welcher Chip aktiv ist: Bargeld ist derselbe Chip wie die Person, nur mit
  // dem Umschalter daneben — sonst stünde jede Person doppelt in der Reihe.
  const chipFor = (id) => (id === POT ? POT : cashPayerPerson(id) || id);

  return openSheet({
    title: editing ? 'Eintrag bearbeiten' : 'Was kostet euch das?',
    fullHeight: true,
    build: (close) => {
      const formId = nextFormId();

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

      const submit = h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, icon('check', 20));
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

      // Nur eine Person hat Bargeld, das die Kasse ihr schon ausgezahlt hat —
      // steht „Kasse“, gibt es nichts umzuschalten, deshalb bleibt die Zeile
      // dann versteckt statt ausgegraut. Das Geldschein-Symbol daneben macht
      // aus dem Wort „Bargeld“ ein Bild, das man auch im Vorbeiwischen erkennt.
      const moneyKindButtons = [
        h('button.segmented__btn', { type: 'button', onclick: () => setPayKind('private') }, 'Privat'),
        h('button.segmented__btn', { type: 'button', onclick: () => setPayKind('cash') }, icon('cash', 16), 'Bargeld'),
      ];
      const moneyKind = h('div.segmented', ...moneyKindButtons);

      const details = disclosure('Details (optional)', detailSummary,
        h('div.field',
          h('span.field__label', 'Status'),
          h('div.segmented', ...kindButtons),
          kindNote,
        ),
        field('Notiz', note),
      );

      function setPlanned(next) {
        planned = next;
        // „Schon bezahlt“ und ein Datum in der Zukunft passen nicht zusammen:
        // dann ist heute gemeint.
        if (!planned && date > today) { date = today; when.set(today); }
        syncKind();
      }

      /** Wechselt die Geldform der schon gewählten Person, nicht die Person selbst. */
      function setPayKind(kind) {
        payKind = kind;
        if (payer !== POT) payer = kind === 'cash' ? cashPayerFor(chipFor(payer)) : chipFor(payer);
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
        moneyKind.hidden = payer === POT;
        moneyKindButtons[0].classList.toggle('is-active', !isCashPayer(payer));
        moneyKindButtons[1].classList.toggle('is-active', isCashPayer(payer));
        // Zugeklappt muss ablesbar bleiben, was drinsteht — der Zahler steht
        // jetzt selbst offen da, hier geht es nur noch um Status und Notiz.
        detailSummary.textContent = [planned ? 'verplant' : '', note.value ? 'Notiz' : ''].filter(Boolean).join(' · ');
        submit.replaceChildren(editing ? 'Speichern' : planned ? 'Vormerken' : 'Eintragen');
      }
      syncKind();

      // Aufgeklappt startet die Zeile nur, wenn dort etwas steht, das jemanden
      // überraschen könnte — eine Vormerkung oder eine Notiz.
      details.open = planned || Boolean(note.value);

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Wofür?', categoryGrid(category, (id) => { category = id; })),
        h('label.field', dateLabel, when.el),
        h('label.field', payerLabelEl, chipRow(payers, chipFor(payer), (id) => {
          payer = id === POT ? POT : (payKind === 'cash' ? cashPayerFor(id) : id);
          syncKind();
        }), moneyKind),
        details,
      );

      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        submit,
      );

      return { body, footer };
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
      const formId = nextFormId();
      const save = () => {
        const cents = amount.getCents();
        if (!(cents > 0)) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        close({ action: 'save', values: { amount: cents, date, personId, note: note.value } });
      };

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('Von wem?', chipRow(trip.people.map((p) => ({ id: p.id, label: p.name, dot: p.color })), personId, (id) => { personId = id; })),
        field('Wann?', dateRow(date, (iso) => { date = iso; }).el),
        field('Notiz', note),
      );
      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, editing ? 'Speichern' : 'Eintragen'),
      );
      return { body, footer };
    },
  });
}

/**
 * Bargeld aus der Kasse an eine Person ausgezahlt.
 *
 * Anders als eine Einzahlung fließt hier nichts dazu — das Geld war schon in
 * der Kasse, es wechselt nur die Form. Deshalb zählt der Eintrag auch nicht
 * als Ausgabe: erst wenn die Person davon etwas bezahlt, trägt man das als
 * eigene Ausgabe mit „Bargeld“ als Zahler ein.
 */
export function cashOutSheet({ trip, cashOut = null, defaults = {} }) {
  const editing = Boolean(cashOut);
  let personId = cashOut?.personId || defaults.personId || trip.people[0]?.id;
  let date = cashOut?.date || defaults.date || todayISO();
  const amount = amountField(cashOut?.amount || 0, trip.currency);
  const note = h('input.field__input', { type: 'text', value: cashOut?.note || '', placeholder: 'z. B. vom Automaten geholt', maxlength: 120 });

  return openSheet({
    title: editing ? 'Bargeld-Auszahlung bearbeiten' : 'Bargeld ausgezahlt',
    subtitle: 'Wer hat wie viel Bargeld aus der Kasse bekommen?',
    fullHeight: true,
    build: (close) => {
      const formId = nextFormId();
      const save = () => {
        const cents = amount.getCents();
        if (!(cents > 0)) {
          amount.focusHint.textContent = 'Bitte einen Betrag eingeben';
          amount.focusHint.classList.add('is-error');
          return;
        }
        close({ action: 'save', values: { amount: cents, date, personId, note: note.value } });
      };

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        amount.el,
        field('An wen?', chipRow(trip.people.map((p) => ({ id: p.id, label: p.name, dot: p.color })), personId, (id) => { personId = id; })),
        field('Wann?', dateRow(date, (iso) => { date = iso; }).el),
        field('Notiz', note),
      );
      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, editing ? 'Speichern' : 'Eintragen'),
      );
      return { body, footer };
    },
  });
}

/**
 * Programmpunkt anlegen oder bearbeiten: was, wann — und optional, wofür
 * dabei Geld draufgeht. Anders als bei einer Ausgabe ist der Betrag hier nicht
 * die Hauptsache, sondern ein optionaler Teil: der Titel steht zuerst.
 *
 * Ein Kostenpunkt wird sofort zur Vormerkung in der Kasse (siehe
 * `store.addPlanItem`/`updatePlanItem`) — dieselbe Vormerkung, die auch beim
 * Eintragen einer Ausgabe mit Zukunftsdatum entsteht, nur von der anderen
 * Seite her gedacht. Ist sie inzwischen bezahlt (`linkedExpense` nicht mehr
 * `planned`), ist sie echte Ausgabengeschichte: der Kostenbereich zeigt dann
 * nur noch den Betrag, ändern geht ab da nur noch unter „Ausgaben“.
 */
export function planItemSheet({ trip, planItem = null, linkedExpense = null, defaults = {} }) {
  const editing = Boolean(planItem);
  const realized = Boolean(linkedExpense && !linkedExpense.planned);
  let category = planItem?.category || defaults.category || 'activity';
  let sub = planItem ? planSub(planItem) : planSub({ category, sub: defaults.sub });
  let date = planItem?.date || defaults.date || todayISO();
  let payer = planItem?.payer || linkedExpense?.payer || defaults.payer || POT;
  const title = h('input.field__input', { type: 'text', value: planItem?.title || '', placeholder: 'z. B. Trollstigen', maxlength: 120, enterkeyhint: 'next' });
  const time = h('input.field__input', { type: 'time', value: planItem?.time || '' });
  const endTime = h('input.field__input', { type: 'time', value: planItem?.endTime || '' });
  // Eine echte Adresse statt eines bloßen Stichworts — nicht nur, weil sie
  // sich so leichter wiederfindet, sondern weil sie perspektivisch als Ziel
  // für eine Fahrzeitberechnung taugen soll (siehe `staySheet`, mit derselben
  // Begründung). Ein Stichwort wie „Altstadt“ bleibt trotzdem möglich, wird
  // nur nicht mehr als Beispiel vorgeschlagen.
  const location = h('input.field__input', { type: 'text', value: planItem?.location || '', placeholder: 'z. B. Museumsplatz 5, 80538 München', maxlength: 160, enterkeyhint: 'next' });
  const note = h('input.field__input', { type: 'text', value: planItem?.note || '', placeholder: 'Notiz, Reservierung', maxlength: 120, enterkeyhint: 'done' });
  const amount = amountField(linkedExpense?.amount || 0, trip.currency);

  const payers = [{ id: POT, label: 'Kasse', icon: 'wallet' }, ...trip.people.map((p) => ({ id: p.id, label: p.name, dot: p.color }))];

  return openSheet({
    title: editing ? 'Programmpunkt bearbeiten' : 'Was steht an?',
    fullHeight: true,
    build: (close) => {
      const formId = nextFormId();
      const titleError = h('p.field__error');

      const save = () => {
        const t = title.value.trim();
        if (!t) {
          titleError.textContent = 'Bitte einen Titel eingeben';
          title.focus();
          return;
        }
        titleError.textContent = '';
        close({
          action: 'save',
          values: {
            title: t, date, time: time.value,
            // Ein Ende ohne Anfang wäre keine Dauer, sondern nur ein zweites
            // leeres Feld — bleibt „Von“ leer, fällt „Bis“ mit weg.
            endTime: time.value ? endTime.value : '',
            category, sub, location: location.value.trim(), note: note.value, payer,
            // Realisiert wird nichts mehr angetastet — dafür ist der Wert hier
            // gar nicht erst dabei (siehe `store.updatePlanItem`).
            amount: realized ? undefined : Math.max(0, amount.getCents() || 0),
          },
        });
      };

      const when = dateRow(date, (iso) => { date = iso; }, { withTomorrow: true });

      // Ein Programmpunkt rutscht öfter mal einen Tag: die Wanderung war für
      // Dienstag gedacht, aber der Dienstag wird ein Regentag. Die Pfeile
      // schieben das Datum um einen Tag, ohne dass man die Kalenderwahl
      // darunter aufklappen muss — dieselbe Handbewegung wie beim Blättern
      // im Reiseplan.
      const shiftDay = (delta) => { const next = addDays(date, delta); date = next; when.set(next); };

      const costNote = h(
        'p.field__note',
        realized
          ? `Bezahlt: ${money(linkedExpense.amount, trip.currency)} — ändern geht unter „Ausgaben“.`
          : 'Optional. Wird sofort als Vormerkung in die Kasse übernommen.',
      );

      const costBody = realized
        ? h('p.amount__hint', money(linkedExpense.amount, trip.currency))
        : h('div.stack',
            amount.el,
            h('label.field', h('span.field__label', 'Bezahlt von'), chipRow(payers, payer, (id) => { payer = id; })),
          );

      // Die Sorten hängen an der Kategorie und werden deshalb neu gesetzt,
      // wenn die Kategorie wechselt — mitsamt der Wahl selbst: „Museum“ unter
      // „Flug“ wäre keine Angabe mehr, sondern ein Fehler mit Etikett. Wie
      // bei der Packliste (siehe `packItemSheet`).
      const subBox = h('div');
      const subField = field('Welche Art?', subBox);
      const renderSubs = () => {
        const list = planSubs(category);
        subField.hidden = !list.length;
        replace(subBox, list.length
          ? categoryGrid(sub, (id) => { sub = id; }, [{ id: '', label: 'Ohne Angabe' }, ...list])
          : null);
      };
      renderSubs();

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label.field', h('span.field__label', 'Titel'), title, titleError),
        field('Wofür?', categoryGrid(category, (id) => { category = id; sub = ''; renderSubs(); }, PLAN_CATEGORIES)),
        subField,
        field('Wann?', h('div.daterow-shift',
          h('button.icon-btn', { type: 'button', title: 'Einen Tag früher', 'aria-label': 'Einen Tag früher', onclick: () => shiftDay(-1) }, icon('chevron', 18)),
          when.el,
          h('button.icon-btn', { type: 'button', title: 'Einen Tag später', 'aria-label': 'Einen Tag später', onclick: () => shiftDay(1) }, icon('chevron', 18)),
        )),
        h('div.field__pair',
          h('label.field', h('span.field__label', 'Von (optional)'), time),
          h('label.field', h('span.field__label', 'Bis (optional)'), endTime),
        ),
        field('Ort / Adresse (optional)', location),
        h('div.field',
          h('span.field__label', 'Kosten (optional)'),
          costBody,
          costNote,
        ),
        field('Notiz', note),
      );
      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, editing ? 'Speichern' : 'Eintragen'),
      );
      return { body, footer };
    },
  });
}

/**
 * Unterkunft anlegen oder bearbeiten: wo übernachtet die Gruppe, und von wann
 * bis wann. Anders als ein Programmpunkt gilt sie nicht für einen einzelnen
 * Tag, sondern für einen Zeitraum — dieselbe Unterkunft steht dann an jedem
 * Tag dazwischen im Reiseplan (siehe `views/plan.js`), ohne dass man sie
 * mehrfach einträgt.
 *
 * Die Adresse ist der eigentliche Grund für dieses Feld: perspektivisch soll
 * von hier aus die Fahrzeit zum ersten Programmpunkt des Tages berechnet
 * werden (eine externe Routen-API, noch nicht angebunden) — dafür braucht es
 * eine echte Adresse, kein bloßes Stichwort wie beim Ort eines Programmpunkts.
 */
export function staySheet({ stay = null, defaults = {} } = {}) {
  const editing = Boolean(stay);
  let start = stay?.startDate || defaults.date || todayISO();
  let end = stay?.endDate || defaults.date || start;
  const name = h('input.field__input', { type: 'text', value: stay?.name || '', placeholder: 'z. B. Hotel Sonne', maxlength: 120, enterkeyhint: 'next' });
  const address = h('input.field__input', { type: 'text', value: stay?.address || '', placeholder: 'z. B. Seestraße 12, 8280 Kreuzlingen', maxlength: 200, enterkeyhint: 'next' });
  const note = h('input.field__input', { type: 'text', value: stay?.note || '', placeholder: 'Buchungsnummer, Zimmer, Ansprechpartner', maxlength: 120, enterkeyhint: 'done' });

  return openSheet({
    title: editing ? 'Unterkunft bearbeiten' : 'Unterkunft eintragen',
    fullHeight: true,
    build: (close) => {
      const formId = nextFormId();
      const nameError = h('p.field__error');
      const rangeNote = h('p.field__note');
      const rangeError = h('p.field__error');

      const sync = () => {
        endInput.min = start;
        rangeNote.textContent = end >= start ? days(daysInclusive(start, end)) : '';
        rangeError.textContent = end < start ? 'Das Ende liegt vor dem Anfang.' : '';
      };

      const startInput = h('input.field__input', { type: 'date', value: start, onchange: (e) => {
        if (!isValidDate(e.target.value)) return;
        start = e.target.value;
        // Mitziehen statt meckern: wer den Anfang nach hinten schiebt, meint
        // meistens den ganzen Aufenthalt, nicht einen Zeitraum mit negativer
        // Länge (wie bei „Zeitraum“ in den Einstellungen).
        if (end < start) { end = start; endInput.value = end; }
        sync();
      } });
      const endInput = h('input.field__input', { type: 'date', value: end, min: start, onchange: (e) => {
        if (!isValidDate(e.target.value)) return;
        end = e.target.value;
        sync();
      } });
      sync();

      const save = () => {
        const n = name.value.trim();
        if (!n) {
          nameError.textContent = 'Bitte einen Namen eingeben';
          name.focus();
          return;
        }
        if (end < start) return;
        nameError.textContent = '';
        close({ action: 'save', values: { name: n, address: address.value.trim(), startDate: start, endDate: end, note: note.value } });
      };

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label.field', h('span.field__label', 'Name'), name, nameError),
        h('div.field__pair',
          h('label.field', h('span.field__label', 'Von'), startInput),
          h('label.field', h('span.field__label', 'Bis'), endInput),
        ),
        rangeNote,
        rangeError,
        field('Adresse', address),
        field('Notiz', note),
      );
      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, editing ? 'Speichern' : 'Eintragen'),
      );
      return { body, footer };
    },
  });
}

/**
 * Ein Eintrag der Packliste anlegen oder bearbeiten.
 *
 * Die schlichteste Maske der App, und das mit Absicht: eine Packliste entsteht
 * in einem Rutsch — Handtuch, Ladekabel, Sonnencreme, Reisepass —, und jede
 * Pflichtangabe zwischendurch bricht diesen Fluss. Deshalb reicht ein Titel;
 * Kategorie, Stand und Gepäck stehen offen da und lassen sich beim
 * Durchgehen der Liste an jeder Zeile nachziehen.
 *
 * Für das reine Eintragen gibt es außerdem das Schnellfeld über der Liste
 * (siehe `views/packing.js`) — diese Maske ist der Weg, wenn etwas
 * dazugehört, was dort nicht hinpasst: eine Notiz, ein anderer Stand.
 */
export function packItemSheet({ packItem = null, defaults = {} } = {}) {
  const editing = Boolean(packItem);
  let category = packItem ? packCategory(packItem) : defaults.category || 'clothing';
  let sub = packItem ? packSub(packItem) : packSub({ category, sub: defaults.sub });
  let qty = packItem ? packQty(packItem) : 1;
  let status = packItem ? packStatus(packItem) : defaults.status || 'open';
  let bag = packItem ? packBag(packItem) : defaults.bag || 'none';
  let shared = packItem ? packItemShared(packItem) : defaults.shared === true;
  const title = h('input.field__input', { type: 'text', value: packItem?.title || '', placeholder: 'z. B. Reisepass', maxlength: 120, enterkeyhint: 'next' });
  const note = h('input.field__input', { type: 'text', value: packItem?.note || '', placeholder: 'Marke, Farbe, wo es liegt', maxlength: 120, enterkeyhint: 'done' });

  return openSheet({
    title: editing ? 'Eintrag bearbeiten' : 'Was muss mit?',
    fullHeight: true,
    build: (close) => {
      const formId = nextFormId();
      const titleError = h('p.field__error');

      const save = () => {
        const t = title.value.trim();
        if (!t) {
          titleError.textContent = 'Bitte einen Titel eingeben';
          title.focus();
          return;
        }
        titleError.textContent = '';
        close({ action: 'save', values: { title: t, category, sub, qty, status, bag, note: note.value, shared } });
      };

      // Die Sorten hängen an der Kategorie und werden deshalb neu gesetzt,
      // wenn die Kategorie wechselt — mitsamt der Wahl selbst: „T-Shirt“ unter
      // „Schuhe“ wäre keine Angabe mehr, sondern ein Fehler mit Etikett.
      const subBox = h('div');
      const subField = field('Welche Sorte?', subBox);
      const renderSubs = () => {
        const list = packSubs(category);
        subField.hidden = !list.length;
        replace(subBox, list.length
          ? categoryGrid(sub, (id) => { sub = id; }, [{ id: '', label: 'Ohne Angabe' }, ...list])
          : null);
      };
      renderSubs();

      const body = h('form.entry', { id: formId, onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label.field', h('span.field__label', 'Was ist es?'), title, titleError),
        // Wessen Liste, vor allem anderen: davon hängt ab, wer den Eintrag
        // danach überhaupt zu Gesicht bekommt — Kategorie und Stand lassen
        // sich jederzeit an der Zeile nachziehen, das hier nicht.
        field('Wessen Liste?', categoryGrid(shared ? 'shared' : 'mine', (id) => { shared = id === 'shared'; }, PACK_SCOPES)),
        field('Wie viele?', qtyStepper(qty, (n) => { qty = n; })),
        field('Wohin gehört es?', categoryGrid(category, (id) => { category = id; sub = ''; renderSubs(); }, PACK_CATEGORIES)),
        subField,
        // Status: `short` bleibt hier außen vor — das Kürzel ist als
        // Beiwort für die Zeile lokalisiert (klein geschrieben), in den
        // Reitern soll derselbe ganze Satz stehen wie bei Kategorie und
        // Sorte darüber.
        field('Wie weit ist es?', categoryGrid(status, (id) => { status = id; }, PACK_STATUSES.map(({ id, label }) => ({ id, label })))),
        field('In welches Gepäck?', categoryGrid(bag, (id) => { bag = id; }, PACK_BAGS)),
        field('Notiz', note),
      );
      const footer = h('div.entry__actions',
        editing ? h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => close({ action: 'delete' }) }, icon('trash', 19), 'Löschen') : null,
        h('button.btn.btn--primary.btn--wide', { type: 'submit', form: formId }, editing ? 'Speichern' : 'Eintragen'),
      );
      return { body, footer };
    },
  });
}
