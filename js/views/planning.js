/**
 * Planung: die Tagesplanung und die Packliste unter einem Dach.
 *
 * Beides ist Vorbereitung, und beides braucht die ganze Seite für sich — „was
 * machen wir wann“ und „was muss mit“ untereinander wären zwei Listen, von
 * denen die zweite nie jemand zu Gesicht bekäme. Deshalb derselbe Umschalter
 * wie unter „Finanzen“: ein Reiterpaar oben, darunter unverändert die Ansicht,
 * die es schon gab.
 *
 * Welcher Reiter offen ist, wird wie dort nur für die Sitzung gemerkt.
 */
import { h } from '../dom.js';
import { renderPlan } from './plan.js';
import { renderPacking } from './packing.js';

const PANES = [
  { id: 'tage', label: 'Tagesplanung' },
  { id: 'packliste', label: 'Packliste' },
];

let pane = 'tage';

/** Für den schwebenden Knopf: er trägt je nach Reiter etwas anderes ein. */
export function planningPane() {
  return pane;
}

export function renderPlanning(state, actions) {
  // Beide Ansichten bringen ihre eigene `.view`-Hülle mit; der Umschalter wird
  // ihr vorangestellt, statt eine zweite Hülle darum zu legen — sonst stünde
  // jede Seite in zwei ineinander verschachtelten Rändern.
  const view = pane === 'packliste' ? renderPacking(state, actions) : renderPlan(state, actions);
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
