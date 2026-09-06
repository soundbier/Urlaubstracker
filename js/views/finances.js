/**
 * Finanzen: die Ausgabenliste und die Kasse unter einem Dach.
 *
 * Beides gehört zusammen — „was ist rausgegangen“ und „wie steht die Kasse“
 * sind zwei Blicke auf dasselbe Geld —, und beides ist zu umfangreich für eine
 * einzige durchlaufende Seite: zwei Kopfzahlen übereinander, und keine wäre
 * mehr die eine laute Zahl des Bildschirms. Deshalb ein Umschalter oben, in
 * derselben Reiter-Optik wie überall sonst, und darunter unverändert die
 * Ansicht, die schon vorher da war.
 *
 * Welcher Reiter offen ist, wird wie der Kategorie-Filter darunter nur für die
 * Sitzung gemerkt: wer eine Ausgabe einträgt, soll danach nicht plötzlich in
 * der Abrechnung stehen.
 */
import { h } from '../dom.js';
import { renderExpenses } from './expenses.js';
import { renderBudget } from './budget.js';

const PANES = [
  { id: 'ausgaben', label: 'Ausgaben' },
  { id: 'kasse', label: 'Kasse' },
];

let pane = 'ausgaben';

/** Für den schwebenden Knopf: der gehört zur Liste, nicht zur Abrechnung. */
export function financePane() {
  return pane;
}

/** Für die alten Adressen `#/ausgaben` und `#/budget` (siehe app.js). */
export function setFinancePane(id) {
  if (PANES.some((p) => p.id === id)) pane = id;
}

export function renderFinances(state, actions) {
  // Die beiden Ansichten bringen ihre eigene `.view`-Hülle mit; der Umschalter
  // wird ihr vorangestellt, statt eine zweite Hülle darum zu legen — sonst
  // stünde jede Seite in zwei ineinander verschachtelten Rändern.
  const view = pane === 'kasse' ? renderBudget(state, actions) : renderExpenses(state, actions);
  view.prepend(h('div.segmented',
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
