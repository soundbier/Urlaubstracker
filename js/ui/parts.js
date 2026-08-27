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

export function payerLabel(trip, payer) {
  if (payer === POT) return 'Kasse';
  return trip.people.find((p) => p.id === payer)?.name || 'Unbekannt';
}

/** Eine Zeile in der Ausgabenliste. */
export function expenseRow(expense, trip, onClick) {
  const cat = CATEGORY_BY_ID[expense.category] || CATEGORY_BY_ID.other;
  const privatelyPaid = expense.payer !== POT;
  return h('button.row', { type: 'button', onclick: () => onClick(expense) },
    h('span.row__icon', icon(cat.icon, 20)),
    h('span.row__main',
      h('span.row__title', expense.note || cat.label),
      h('span.row__sub',
        expense.note ? cat.label : '',
        privatelyPaid ? h('span.tag', payerLabel(trip, expense.payer)) : null,
        // War vorgemerkt: zählt zu den Ausgaben, aber nicht zum Tagesbudget.
        isFromPlan(expense) ? h('span.tag.tag--plan', 'war verplant') : null,
      ),
    ),
    h('span.row__amount', money(expense.amount, trip.currency)),
  );
}

/**
 * Eine vorgemerkte Ausgabe: noch nicht bezahlt, aber schon vom verfügbaren
 * Geld abgezogen. Neben dem Eintrag steht ein Haken, mit dem daraus mit einem
 * Tipp eine echte Ausgabe wird — deshalb zwei Knöpfe statt einer Zeile.
 */
export function plannedRow(expense, trip, today, { onEdit, onPaid }) {
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
  // Der Betrag steht ohne Vorzeichen da — „− 40 € drüber“ liest sich, als
  // wären es 40 € zu wenig drüber.
  return `${money(Math.abs(buffer), currency)} ${buffer > 0 ? 'gespart' : 'drüber'}`;
}
