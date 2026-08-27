/** Bausteine, die in mehreren Ansichten vorkommen. */
import { h, icon } from '../dom.js';
import { CATEGORY_BY_ID, POT, isFromPlan } from '../calc.js';
import { money, dayLabel } from '../format.js';

export function tile(label, value, sub, { tone = '' } = {}) {
  return h('div.tile', { class: tone && `tile--${tone}` },
    h('p.tile__label', label),
    h('p.tile__value', value),
    sub ? h('p.tile__sub', sub) : null,
  );
}

export function sectionTitle(text, action) {
  return h('div.section__head', h('h2.section__title', text), action || null);
}

/**
 * Aufklappbare Zeile für alles, was man selten anfasst.
 *
 * Die Zusammenfassung rechts ist der Preis dafür, dass hier etwas versteckt
 * wird: was drinsteht, muss auch zugeklappt ablesbar sein. `<details>` statt
 * eigener Knopflogik, damit Tastatur und Screenreader ohne Zutun
 * funktionieren.
 */
export function disclosure(title, summaryEl, ...body) {
  return h('details.disclosure',
    h('summary.disclosure__head',
      h('span.disclosure__title', title),
      summaryEl || h('span.disclosure__summary'),
      icon('chevron', 18),
    ),
    h('div.disclosure__body', ...body),
  );
}

export function payerLabel(trip, payer) {
  if (payer === POT) return 'Kasse';
  return trip.people.find((p) => p.id === payer)?.name || 'Unbekannt';
}

/**
 * Wer hat das eingetippt?
 *
 * Auf zwei synchronisierten Handys ist das der Unterschied zwischen „das Essen
 * fehlt noch“ und „das hat Ben schon eingetragen“ — sonst steht die Runde
 * abends zweimal drin. Beim eigenen Eintrag bleibt es weg (das weiß man), und
 * beim privat bezahlten auch: dort steht der Name schon als Zahler daneben.
 */
function byLabel(expense, trip, me) {
  const id = expense.createdBy;
  if (!id || id === me || id === expense.payer) return null;
  const person = trip.people.find((p) => p.id === id);
  if (!person) return null;
  return h('span.row__by',
    h('span.dot', { style: { background: person.color } }),
    `von ${person.name}`,
  );
}

/**
 * Eine Zeile in der Ausgabenliste — antippen zum Bearbeiten, der Knopf rechts
 * trägt dieselbe Ausgabe noch einmal mit dem heutigen Datum ein.
 */
export function expenseRow(expense, trip, { onEdit, onRepeat = null, me = null } = {}) {
  const cat = CATEGORY_BY_ID[expense.category] || CATEGORY_BY_ID.other;
  const privatelyPaid = expense.payer !== POT;
  // Ohne Notiz steht die Kategorie schon in der Titelzeile — dann bleibt die
  // Unterzeile ganz weg, statt als leere Zeile Höhe zu belegen.
  const sub = [
    expense.note ? cat.label : null,
    privatelyPaid ? h('span.tag', payerLabel(trip, expense.payer)) : null,
    // War vorgemerkt: zählt zu den Ausgaben, aber nicht zum Tagesbudget.
    isFromPlan(expense) ? h('span.tag.tag--plan', 'war verplant') : null,
    byLabel(expense, trip, me),
  ].filter(Boolean);

  const open = h('button.row', { type: 'button', onclick: () => onEdit(expense) },
    h('span.row__icon', icon(cat.icon, 20)),
    h('span.row__main',
      h('span.row__title', expense.note || cat.label),
      sub.length ? h('span.row__sub', ...sub) : null,
    ),
    h('span.row__amount', money(expense.amount, trip.currency)),
  );

  if (!onRepeat) return open;

  return h('div.erow',
    open,
    h('button.erow__again', {
      type: 'button',
      title: 'Nochmal eintragen',
      'aria-label': `${expense.note || cat.label} nochmal eintragen`,
      onclick: () => onRepeat(expense),
    }, icon('repeat', 19)),
  );
}

/**
 * Eine vorgemerkte Ausgabe: noch nicht bezahlt, aber schon vom verfügbaren
 * Geld abgezogen. Neben dem Eintrag steht ein Haken, mit dem daraus mit einem
 * Tipp eine echte Ausgabe wird — deshalb zwei Knöpfe statt einer Zeile.
 */
export function plannedRow(expense, trip, today, { onEdit, onPaid, me = null }) {
  const cat = CATEGORY_BY_ID[expense.category] || CATEGORY_BY_ID.other;
  const overdue = expense.date < today;
  const privatelyPaid = expense.payer !== POT;
  return h('div.prow', { class: overdue ? 'is-overdue' : '' },
    h('button.prow__open', { type: 'button', onclick: () => onEdit(expense) },
      h('span.row__icon.row__icon--planned', icon(cat.icon, 20)),
      h('span.row__main',
        h('span.row__title', expense.note || cat.label),
        h('span.row__sub',
          overdue ? h('span.tag.tag--due', 'fällig') : dayLabel(expense.date, today, { compact: true }),
          privatelyPaid ? h('span.tag', payerLabel(trip, expense.payer)) : null,
          byLabel(expense, trip, me),
        ),
      ),
      h('span.row__amount.row__amount--planned', money(expense.amount, trip.currency)),
    ),
    h('button.prow__done', { type: 'button', title: 'Als bezahlt eintragen', 'aria-label': 'Als bezahlt eintragen', onclick: () => onPaid(expense) },
      icon('check', 20),
    ),
  );
}

export function contributionRow(contribution, trip, onClick) {
  const person = trip.people.find((p) => p.id === contribution.personId);
  return h('button.row', { type: 'button', onclick: () => onClick(contribution) },
    h('span.row__icon.row__icon--person', { style: { background: person?.color || '#64748b' } }, (person?.name || '?').slice(0, 1).toUpperCase()),
    h('span.row__main',
      h('span.row__title', person?.name || 'Unbekannt'),
      h('span.row__sub', contribution.note || 'Einzahlung'),
    ),
    h('span.row__amount.row__amount--in', `+ ${money(contribution.amount, trip.currency)}`),
  );
}

export function emptyState(text, actionLabel, onAction) {
  return h('div.empty',
    h('p.empty__text', text),
    onAction ? h('button.btn.btn--ghost', { type: 'button', onclick: onAction }, icon('plus', 18), actionLabel) : null,
  );
}

/** Waagerechter Fortschrittsbalken, 0…1, mit Farbton. */
export function bar(ratio, tone = 'good') {
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return h('div.bar', { class: `bar--${tone}`, role: 'presentation' }, h('div.bar__fill', { style: { width: `${pct}%` } }));
}

export function bufferLabel(buffer, currency) {
  if (buffer === 0) return 'genau im Plan';
  // Der Betrag steht ohne Vorzeichen da — „− 40 € über dem Plan“ liest sich,
  // als wären es 40 € zu wenig drüber. Dieselben Worte wie auf der
  // Polster-Kachel, damit nicht zwei Formulierungen dieselbe Zahl beschreiben.
  return `${money(Math.abs(buffer), currency)} ${buffer > 0 ? 'unter' : 'über'} dem Plan`;
}
