/**
 * Die Tagesplanung: was wann ansteht, Tag für Tag — Sehenswürdigkeiten,
 * Essen, Aktivitäten. Die Übersicht über die ganze Reise; der einzelne Tag
 * steht ausführlich auf „Heute“, ein Tipp auf die Datumszeile schlägt ihn
 * dort auf. Übersicht und Tagesblatt, wie im Kalender.
 *
 * Einer der beiden Reiter unter „Planung“ (siehe `planning.js`); der andere
 * ist die Packliste.
 *
 * Anders als die Ausgabenliste zeigt dieser Screen jeden Reisetag, auch die,
 * an denen noch nichts steht — ein Planer, der nur die Tage mit Einträgen
 * zeigt, verschweigt genau die Lücken, die er eigentlich sichtbar machen soll.
 */
import { h, icon } from '../dom.js';
import { planItemsByDay, planDayProgress, stayForDate, todayISO } from '../calc.js';
import { dayLabel } from '../format.js';
import { planItemRow, bar } from '../ui/parts.js';
import { openPlanDay } from './today.js';

export function renderPlan(state, actions) {
  const { trip, planItems, expenses, stays } = state;
  const today = todayISO();
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const groups = planItemsByDay(planItems, trip.startDate, trip.endDate);
  const { done, total } = planDayProgress(planItems, expenseById);

  const openDay = (date) => { openPlanDay(date); actions.goto('heute'); };

  return h('div.view',
    // Steht schon etwas im Plan, ist der Stand über die ganze Reise die
    // nützlichere Kopfzeile als ein Satz, der nur den Bildschirm benennt. Wie
    // der Bildschirm heißt, sagt ohnehin der Reiter darüber — hier steht
    // deshalb, was gezählt wird, nicht noch einmal „Tagesplanung“.
    total
      ? h('div.summary',
          h('p.summary__label', 'Erledigt'),
          h('p.summary__value', `${done} von ${total}`),
          h('p.summary__meta', 'Programmpunkten'),
        )
      : h('div.hero.hero--muted',
          h('p.hero__title', 'Was steht an?'),
          h('p.hero__sub', 'Sehenswürdigkeiten, Essen, Aktivitäten — Tag für Tag.'),
        ),
    h('div.daygroups', ...groups.map((g) => dayGroup(g, trip, today, expenseById, stays, actions, openDay))),
  );
}

function dayGroup(group, trip, today, expenseById, stays, actions, openDay) {
  const { done, total } = planDayProgress(group.items, expenseById);
  const stay = stayForDate(stays, group.date);
  return h('section.daygroup',
    h('header.daygroup__head',
      h('div.daygroup__line',
        // Die Datumszeile ist der Weg in den Tag: sie führt auf „Heute“, wo
        // derselbe Tag mit Uhrzeiten-Spalte und Tageswahl steht.
        h('button.daygroup__open', {
          type: 'button',
          'aria-label': `${dayLabel(group.date, today)} öffnen`,
          onclick: () => openDay(group.date),
        }, h('h3.daygroup__title', dayLabel(group.date, today)), icon('chevron', 16)),
        h('button.btn.btn--small', { type: 'button', onclick: () => actions.addPlanItem({ date: group.date }) }, icon('plus', 16), 'Eintragen'),
      ),
      stayLine(stay, group.date, actions),
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

/**
 * Die Unterkunft dieses Tages — antippen öffnet sie zum Bearbeiten, oder,
 * wenn keine hinterlegt ist, die Maske zum Eintragen mit diesem Tag als
 * Anfang. Eine eigene, schmale Zeile statt eines Eintrags in der Liste
 * darunter: eine Unterkunft ist kein Programmpunkt für diesen einen Tag,
 * sondern gilt oft für mehrere hintereinander (siehe `calc.stayForDate`).
 */
function stayLine(stay, date, actions) {
  const text = stay ? [stay.name, stay.address].filter(Boolean).join(' · ') : 'Unterkunft eintragen';
  return h('button.daygroup__stay', {
    type: 'button',
    onclick: () => (stay ? actions.editStay(stay) : actions.addStay({ date })),
  }, icon('stay', 14), h('span', text));
}
