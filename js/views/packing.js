/**
 * Die Packliste: was mit muss, wie weit es ist, in welche Tasche es gehört.
 *
 * Der zweite Reiter der Planung — und der einzige Bereich der App ohne Geld
 * und ohne Datum. Ein Koffer wird nicht an einem Dienstag gepackt, sondern bis
 * zur Abfahrt; deshalb keine Tagesgruppen, sondern Kategorien.
 *
 * Der Ablauf, den dieser Bildschirm bedienen muss, ist immer derselbe: erst
 * fällt einem alles auf einmal ein und muss schnell auf die Liste, Tage später
 * geht man sie durch und hakt ab, wäscht, kauft. Dafür zwei Wege ins selbe
 * Ziel — das Schnellfeld über der Liste für den ersten Schwung (ein Wort, ein
 * Tipp, weiter) und die Maske hinter dem schwebenden Knopf für alles, was
 * gleich eine Notiz oder einen Stand mitbringt.
 */
import { h, icon } from '../dom.js';
import {
  PACK_CATEGORIES, packBag, packItemPacked, packItemsByCategory, packItemsByStatus, packProgress,
} from '../calc.js';
import { plural } from '../format.js';
import { packItemRow, sectionTitle, emptyState, bar } from '../ui/parts.js';

/**
 * Vier Fragen, die man an eine Packliste stellt — nicht vier Filter über
 * derselben. „Was ist noch zu tun“ gruppiert deshalb nach Stand, die anderen
 * drei nach Kategorie: beim Kofferpacken sucht man nach Sorte, in der Woche
 * davor nach dem, was noch fehlt.
 *
 * Die Gepäck-Reiter erscheinen erst, wenn wirklich etwas zugeordnet ist —
 * solange die Liste nur gesammelt wird, wäre das eine leere Auswahl.
 */
const TABS = [
  { id: 'alles', label: 'Alles' },
  { id: 'hand', label: 'Handgepäck' },
  { id: 'hold', label: 'Aufgabegepäck' },
  { id: 'todo', label: 'Zu tun' },
];

/**
 * Reiter und die Kategorie des Schnellfelds: nur für diese Sitzung gemerkt,
 * wie der Kategorie-Filter unter „Ausgaben“.
 */
let tab = 'alles';
let quickCategory = 'clothing';

/** Was ein Reiter zeigt. */
function itemsFor(items, id) {
  if (id === 'hand' || id === 'hold') return items.filter((i) => packBag(i) === id);
  // „Zu tun“ ist alles, was noch nicht im Koffer liegt — egal aus welchem
  // Grund: noch offen, noch zu kaufen, noch zu waschen, liegt bereit.
  if (id === 'todo') return items.filter((i) => !packItemPacked(i));
  return items;
}

export function renderPacking(state, actions) {
  const items = state.packItems;
  const { done, total } = packProgress(items);

  const tabs = TABS.filter((t) => t.id === 'alles' || itemsFor(items, t.id).length);
  if (!tabs.some((t) => t.id === tab)) tab = 'alles';

  const shown = itemsFor(items, tab);
  const byStatus = tab === 'todo';
  const groups = byStatus ? packItemsByStatus(shown) : packItemsByCategory(shown);

  return h('div.view',
    // Wie der Bildschirm heißt, steht im Reiter darüber; hier steht der Stand.
    // Die Meta-Zeile wiederholt nicht die Zahl, sondern sagt, was von ihr noch
    // aussteht — danach fragt man kurz vor der Abfahrt.
    total
      ? h('div.summary',
          h('p.summary__label', 'Eingepackt'),
          h('p.summary__value', `${done} von ${total}`),
          h('p.summary__meta', done === total ? 'alles beisammen' : `${total - done} noch offen`),
          bar(done / total, 'neutral'),
        )
      : h('div.hero.hero--muted',
          h('p.hero__title', 'Die Liste ist noch leer'),
          h('p.hero__sub', 'Erst alles aufschreiben, was mit muss — sortieren, abhaken und aufs Gepäck verteilen könnt ihr danach.'),
        ),
    tabs.length > 1
      ? h('div.tabs', { role: 'tablist' }, ...tabs.map((t) =>
          h('button.tab', {
            type: 'button',
            role: 'tab',
            'aria-selected': t.id === tab ? 'true' : 'false',
            class: t.id === tab ? 'is-active' : '',
            onclick: () => { tab = t.id; actions.rerender(); },
          }, t.label),
        ))
      : null,
    quickAdd(actions),
    groups.length
      ? h('div.packgroups', ...groups.map((g) => group(g, byStatus, actions)))
      : emptyState(total ? 'Hier steht noch nichts.' : 'Noch nichts auf der Liste.'),
  );
}

/**
 * Eine Gruppe: eine Kategorie oder — im Reiter „Zu tun“ — ein Stand.
 *
 * Rechts steht bei den Kategorien der Stand („3 von 7“), bei den Ständen nur
 * die Anzahl: „0 von 4 eingepackt“ unter der Überschrift „Noch zu kaufen“ wäre
 * eine Zahl, die schon in der Überschrift steht.
 */
function group(g, byStatus, actions) {
  const { done, total } = packProgress(g.items);
  return h('section.section',
    sectionTitle(g.label, h('span.section__meta', byStatus ? plural(total, 'Eintrag', 'Einträge') : `${done} von ${total}`)),
    h('div.list', ...g.items.map((item) => packItemRow(item, {
      onEdit: actions.editPackItem,
      onToggle: actions.togglePackItem,
    }))),
  );
}

/**
 * Das Schnellfeld: eine Kategorie wählen, dann tippen und abschicken, tippen
 * und abschicken.
 *
 * Es trägt sofort ein, ohne Maske und ohne Meldung — die neue Zeile steht ja
 * unmittelbar darunter, das ist die ehrlichere Rückmeldung als ein Balken, der
 * sich über die Liste legt. Steht gerade ein Gepäck-Reiter offen, landet der
 * Eintrag gleich in dieser Tasche.
 *
 * Das Feld wird gehalten und nicht bei jedem Aufbau neu gebaut — wie der
 * Sperrbildschirm in `app.js` und aus demselben Grund: hier tippt jemand,
 * während im Hintergrund ständig etwas hereinkommt, und ein neu gebautes Feld
 * wäre ein leeres Feld. Den Fokus rettet das allein nicht (beim Aufbau wird
 * das Feld kurz aus dem Dokument genommen), deshalb kommt er danach zurück.
 */
let quickAddEl = null;
let quickInput = null;
let quickActions = null;
let refocusQuick = false;

function quickAdd(actions) {
  // Die Aktionen kommen bei jedem Aufbau herein, das gehaltene Feld schließt
  // sie deshalb nicht ein, sondern liest sie hier.
  quickActions = actions;
  if (!quickAddEl) buildQuickAdd();
  if (refocusQuick) {
    refocusQuick = false;
    requestAnimationFrame(() => quickInput.focus({ preventScroll: true }));
  }
  return quickAddEl;
}

function buildQuickAdd() {
  quickInput = h('input.field__input', {
    type: 'text',
    placeholder: 'Was muss mit?',
    maxlength: 120,
    enterkeyhint: 'done',
    autocomplete: 'off',
  });

  const add = () => {
    const title = quickInput.value.trim();
    if (!title) {
      quickInput.focus();
      return;
    }
    quickInput.value = '';
    refocusQuick = true;
    quickActions.addPackItemQuick({
      title,
      category: quickCategory,
      bag: tab === 'hand' || tab === 'hold' ? tab : 'none',
    });
  };

  const chips = h('div.chips.chips--scroll');
  const buttons = PACK_CATEGORIES.map((c) => {
    // Ohne Neuaufbau umschalten: der würde den halb getippten Text mitnehmen.
    const b = h('button.chip', { type: 'button', dataset: { id: c.id }, onclick: () => {
      quickCategory = c.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === quickCategory));
      quickInput.focus({ preventScroll: true });
    } }, icon(c.icon, 16), c.label);
    b.classList.toggle('is-active', c.id === quickCategory);
    return b;
  });
  chips.append(...buttons);

  quickAddEl = h('form.packadd', { onsubmit: (e) => { e.preventDefault(); add(); } },
    chips,
    h('div.packadd__row',
      quickInput,
      h('button.icon-btn.packadd__go', { type: 'submit', 'aria-label': 'Auf die Liste setzen' }, icon('plus', 22)),
    ),
  );
}
