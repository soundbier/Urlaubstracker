/**
 * Der Reiseplan: was wann ansteht, Tag für Tag — Sehenswürdigkeiten, Essen,
 * Aktivitäten. Kein eigener Tab (die Bottom-Navigation bleibt bei vier
 * ruhigen Zielen), erreichbar über das Kalender-Symbol in der Kopfzeile.
 *
 * Anders als die Ausgabenliste zeigt dieser Screen jeden Reisetag, auch die,
 * an denen noch nichts steht — ein Planer, der nur die Tage mit Einträgen
 * zeigt, verschweigt genau die Lücken, die er eigentlich sichtbar machen soll.
 */
import { h, icon } from '../dom.js';
import { planItemsByDay, planDayProgress, todayISO } from '../calc.js';
import { dayLabel } from '../format.js';
import { planItemRow, bar } from '../ui/parts.js';

export function renderPlan(state, actions) {
  const { trip, planItems, expenses } = state;
  const today = todayISO();
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const groups = planItemsByDay(planItems, trip.startDate, trip.endDate);

  return h('div.view',
    h('div.hero.hero--muted',
      h('p.hero__title', 'Reiseplan'),
      h('p.hero__sub', 'Sehenswürdigkeiten, Essen, Aktivitäten — Tag für Tag.'),
    ),
    h('div.daygroups', ...groups.map((g) => dayGroup(g, trip, today, expenseById, actions))),
  );
}

function dayGroup(group, trip, today, expenseById, actions) {
  const { done, total } = planDayProgress(group.items, expenseById);
  return h('section.daygroup',
    h('header.daygroup__head',
      h('div.daygroup__line',
        h('h3.daygroup__title', dayLabel(group.date, today)),
        h('button.btn.btn--small', { type: 'button', onclick: () => actions.addPlanItem({ date: group.date }) }, icon('plus', 16), 'Eintragen'),
      ),
      // Der Fortschritt eines Tages, nicht nur die Liste selbst: auf einen
      // Blick über alle Reisetage, wo schon abgehakt ist und wo noch nichts
      // stattgefunden hat. Blass wie jede Meta-Auskunft hier — Farbe bliebe
      // dem Verdikt auf „Heute“ vorbehalten.
      total ? h('div.daygroup__progress',
        h('p.daygroup__sub', `${done} von ${total} erledigt`),
        bar(done / total, 'neutral'),
      ) : null,
    ),
    group.items.length
      ? h('div.list', ...group.items.map((item) => planItemRow(item, trip, {
          onEdit: actions.editPlanItem,
          onToggle: actions.togglePlanItem,
          expenseById,
        })))
      : h('p.daygroup__sub', 'Noch nichts geplant.'),
  );
}
