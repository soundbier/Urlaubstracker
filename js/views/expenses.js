/** Alle Ausgaben, nach Tagen gruppiert — die eigentliche Liste. */
import { h, icon } from '../dom.js';
import { computeBudget, groupByDay, paidOnly, plannedOnly, everydayOnly, todayISO, CATEGORY_BY_ID, CATEGORIES } from '../calc.js';
import { money, dayLabel, plural } from '../format.js';
import { expenseRow, plannedRow, sectionTitle, emptyState, bar } from '../ui/parts.js';

/** Über Neuaufbauten hinweg gemerkt, damit der Filter beim Eintragen stehen bleibt. */
let filter = 'all';

export function renderExpenses(state, actions) {
  const { trip, expenses, contributions } = state;
  const today = todayISO();
  const cur = trip.currency;
  const b = computeBudget({ trip, contributions, expenses, today });

  // Vorgemerktes steht in einem eigenen Block: es ist noch nichts ausgegeben
  // und gehört deshalb in keine Tagesgruppe.
  const paid = paidOnly(expenses);
  const inFilter = (e) => filter === 'all' || (CATEGORY_BY_ID[e.category] ? e.category : 'other') === filter;

  const usedCategories = CATEGORIES.filter((c) => expenses.some((e) => (CATEGORY_BY_ID[e.category] ? e.category : 'other') === c.id));
  if (filter !== 'all' && !usedCategories.some((c) => c.id === filter)) filter = 'all';

  const shown = paid.filter(inFilter);
  const planned = plannedOnly(expenses).filter(inFilter);
  const groups = groupByDay(shown);
  const shownTotal = shown.reduce((a, e) => a + e.amount, 0);

  const chips = h('div.chips.chips--scroll',
    filterChip('all', 'Alles', null, actions),
    ...usedCategories.map((c) => filterChip(c.id, c.short, c.icon, actions)),
  );

  return h('div.view',
    h('div.summary',
      h('div',
        h('p.summary__label', filter === 'all' ? 'Bisher ausgegeben' : CATEGORY_BY_ID[filter].label),
        h('p.summary__value', money(shownTotal, cur)),
      ),
      h('p.summary__meta', plural(shown.length, 'Eintrag', 'Einträge')),
    ),
    usedCategories.length > 1 ? chips : null,
    planned.length
      ? h('section.section',
          sectionTitle('Verplant', h('span.section__meta', money(planned.reduce((a, e) => a + e.amount, 0), cur))),
          h('div.list.list--planned', ...planned.map((e) => plannedRow(e, trip, today, { onEdit: actions.editExpense, onPaid: actions.markExpensePaid }))),
        )
      : null,
    groups.length
      ? h('div.daygroups', ...groups.map((g) => dayGroup(g, trip, b, today, actions)))
      : emptyState(
          filter === 'all' ? 'Noch keine Ausgaben eingetragen.' : 'In dieser Kategorie ist noch nichts eingetragen.',
          'Ausgabe eintragen',
          actions.addExpense,
        ),
  );
}

function filterChip(id, label, iconName, actions) {
  return h('button.chip', {
    type: 'button',
    class: filter === id ? 'is-active' : '',
    onclick: () => { filter = id; actions.rerender(); },
  }, iconName ? icon(iconName, 16) : null, label);
}

/** Ein laufender Tag ist noch nicht „unter dem Schnitt“ — nur noch nicht drüber. */
function dayNote(everydayTotal, budget, date, today, cur) {
  const diff = budget.planPerDay - everydayTotal;
  if (diff < 0) return `${money(-diff, cur)} über dem Schnitt`;
  return date === today ? `noch ${money(diff, cur)} bis zum Schnitt` : `${money(diff, cur)} unter dem Schnitt`;
}

function dayGroup(group, trip, budget, today, actions) {
  const cur = trip.currency;
  // Verglichen wird nur das tägliche Geld. Eine bezahlte Vormerkung war nie
  // Teil des Tagesbudgets und würde den Tag sonst haltlos rot färben.
  const everydayTotal = everydayOnly(group.items).reduce((a, e) => a + e.amount, 0);
  // Vergleichsmaßstab ist das Plan-Tagesbudget: dieselbe Linie an jedem Tag.
  const ratio = budget.planPerDay > 0 ? everydayTotal / budget.planPerDay : 0;
  const tone = ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : 'good';

  return h('section.daygroup',
    h('header.daygroup__head',
      h('div',
        h('h3.daygroup__title', dayLabel(group.date, today)),
        budget.planPerDay > 0 ? h('p.daygroup__sub', dayNote(everydayTotal, budget, group.date, today, cur)) : null,
      ),
      h('p.daygroup__total', money(group.total, cur)),
    ),
    budget.planPerDay > 0 ? bar(ratio, tone) : null,
    h('div.list', ...group.items.map((e) => expenseRow(e, trip, actions.editExpense))),
  );
}
