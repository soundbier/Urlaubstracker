/**
 * Finanzen: die Ausgabenliste, die Kasse und die Auswertung unter einem Dach.
 *
 * Alles drei gehört zusammen — „was ist rausgegangen“, „wie steht die Kasse“
 * und „wie ist das Geld ausgegeben worden“ sind drei Blicke auf dasselbe Geld
 * —, und jeder ist zu umfangreich für eine einzige durchlaufende Seite: drei
 * Kopfzahlen untereinander, und keine wäre mehr die eine laute Zahl des
 * Bildschirms. Deshalb ein Umschalter oben, in derselben Reiter-Optik wie
 * überall sonst, und darunter unverändert die Ansicht, die schon vorher da war.
 *
 * Die Reihenfolge ist die der Fragen: eintragen, ausgleichen, nachlesen. Der
 * dritte Reiter ist der einzige, auf dem nichts zu tun ist — deshalb steht er
 * hinten und trägt keinen schwebenden Knopf (siehe `app.fab`).
 *
 * Welcher Reiter offen ist, wird wie der Kategorie-Filter darunter nur für die
 * Sitzung gemerkt: wer eine Ausgabe einträgt, soll danach nicht plötzlich in
 * der Abrechnung stehen.
 */
import { h } from '../dom.js';
import { renderExpenses } from './expenses.js';
import { renderBudget } from './budget.js';
import { renderInsights } from './insights.js';

const PANES = [
  { id: 'ausgaben', label: 'Ausgaben' },
  { id: 'kasse', label: 'Kasse' },
  { id: 'auswertung', label: 'Auswertung' },
];

let pane = 'ausgaben';

/** Für den schwebenden Knopf: der gehört zur Liste, nicht zur Abrechnung und nicht zur Auswertung. */
export function financePane() {
  return pane;
}

/** Für die alten Adressen `#/ausgaben` und `#/budget` (siehe app.js). */
export function setFinancePane(id) {
  if (PANES.some((p) => p.id === id)) pane = id;
}

export function renderFinances(state, actions) {
  // Alle drei Ansichten bringen ihre eigene `.view`-Hülle mit; der Umschalter
  // wird ihr vorangestellt, statt eine zweite Hülle darum zu legen — sonst
  // stünde jede Seite in zwei ineinander verschachtelten Rändern.
  const view =
    pane === 'kasse' ? renderBudget(state, actions)
    : pane === 'auswertung' ? renderInsights(state)
    : renderExpenses(state, actions);
  view.prepend(h('div.segmented.segmented--3',
    ...PANES.map((p) =>
      h('button.segmented__btn', {
        type: 'button',
        class: p.id === pane ? 'is-active' : '',
        'aria-current': p.id === pane ? 'page' : null,
        onclick: () => { pane = p.id; actions.rerender(); },
      }, p.label),
    ),
  ));
  return view;
}
