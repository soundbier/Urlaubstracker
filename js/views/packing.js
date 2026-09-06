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
import { h, icon, replace } from '../dom.js';
import {
  PACK_CATEGORIES, PACK_OVERVIEW_BAGS, packBag, packItemPacked, packItemsByCategory, packItemsByStatus,
  packOverview, packProgress, packSubs,
} from '../calc.js';
import { plural } from '../format.js';
import { packItemRow, sectionTitle, emptyState, bar } from '../ui/parts.js';

/**
 * Fünf Fragen, die man an eine Packliste stellt — nicht fünf Filter über
 * derselben. „Was ist noch zu tun“ gruppiert deshalb nach Stand, die anderen
 * nach Kategorie: beim Kofferpacken sucht man nach Sorte, in der Woche davor
 * nach dem, was noch fehlt.
 *
 * „Übersicht“ zeigt dieselben Sachen ohne die Sachen selbst: nur, wie viel
 * wovon. Das ist keine sechste Sortierung der Liste, sondern die einzige
 * Ansicht, die niemand abhakt — man liest sie und klappt den Koffer zu.
 *
 * Die Gepäck-Reiter erscheinen erst, wenn wirklich etwas zugeordnet ist —
 * solange die Liste nur gesammelt wird, wäre das eine leere Auswahl.
 */
const TABS = [
  { id: 'alles', label: 'Alles' },
  // Die Übersicht steht neben „Alles“, nicht am Ende: das sind die beiden
  // Reiter über der ganzen Liste, die drei danach schneiden etwas heraus. Ganz
  // hinten wäre sie auf einem schmalen Schirm außerdem unsichtbar — der
  // Reiterstreifen schiebt sich zwar zur Seite, aber niemand schiebt an einer
  // Reihe, die abgeschlossen aussieht.
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'hand', label: 'Handgepäck' },
  { id: 'hold', label: 'Aufgabegepäck' },
  { id: 'todo', label: 'Zu tun' },
];

/**
 * Reiter, Kategorie und Sorte des Schnellfelds und die Tasche der Übersicht:
 * nur für diese Sitzung gemerkt, wie der Kategorie-Filter unter „Ausgaben“.
 */
let tab = 'alles';
let quickCategory = 'clothing';
let quickSub = '';
let overviewBag = 'both';
// Welcher Reiter zuletzt in den sichtbaren Bereich geschoben wurde. Ohne das
// stünde der gewählte Reiter nach jedem Neuaufbau wieder außerhalb — und mit
// „bei jedem Aufbau“ würde die Reihe unter dem Finger wegspringen, sobald im
// Hintergrund etwas hereinkommt.
let tabScrolledTo = null;

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

  const overview = tab === 'uebersicht' ? packOverview(items, overviewBag) : null;
  const shown = itemsFor(items, tab);
  const byStatus = tab === 'todo';
  const groups = byStatus ? packItemsByStatus(shown) : packItemsByCategory(shown);

  return h('div.view',
    total
      ? summary(overview, done, total)
      : h('div.hero.hero--muted',
          h('p.hero__title', 'Die Liste ist noch leer'),
          h('p.hero__sub', 'Erst alles aufschreiben, was mit muss — sortieren, abhaken und aufs Gepäck verteilen könnt ihr danach.'),
        ),
    tabs.length > 1 ? tabStrip(tabs, actions) : null,
    ...(overview
      ? [bagSwitch(overview.bag, actions), tally(overview)]
      : [
          quickAdd(actions),
          groups.length
            ? h('div.packgroups', ...groups.map((g) => group(g, byStatus, actions)))
            : emptyState(total ? 'Hier steht noch nichts.' : 'Noch nichts auf der Liste.'),
        ]),
  );
}

/**
 * Der Reiterstreifen. Er ist breiter als der Schirm und schiebt sich zur
 * Seite; der gewählte Reiter wird deshalb hineingeholt, sonst wäre nach einem
 * Tipp auf „Zu tun“ kein einziger Reiter mehr als gewählt zu sehen.
 */
function tabStrip(tabs, actions) {
  const strip = h('div.tabs', { role: 'tablist' }, ...tabs.map((t) =>
    h('button.tab', {
      type: 'button',
      role: 'tab',
      dataset: { id: t.id },
      'aria-selected': t.id === tab ? 'true' : 'false',
      class: t.id === tab ? 'is-active' : '',
      onclick: () => { tab = t.id; actions.rerender(); },
    }, t.label),
  ));

  if (tabScrolledTo !== tab) {
    tabScrolledTo = tab;
    // Erst im Dokument hat der Streifen eine Breite; und geschoben wird nur er,
    // nicht die Seite — `scrollIntoView` nähme die ganze Ansicht mit.
    requestAnimationFrame(() => {
      const active = strip.querySelector('.tab.is-active');
      if (active) strip.scrollLeft = Math.max(0, active.offsetLeft - 16);
    });
  }
  return strip;
}

/**
 * Der Stand über der Liste.
 *
 * Wie der Bildschirm heißt, steht im Reiter darüber; hier steht der Stand. Die
 * Meta-Zeile wiederholt nicht die Zahl, sondern sagt, was von ihr noch
 * aussteht — danach fragt man kurz vor der Abfahrt.
 *
 * In der Übersicht zählt dieselbe Stelle Teile statt Einträge, denn die
 * Übersicht tut es auch: „14 von 22“ über einer Liste mit sieben Zeilen wäre
 * sonst eine Zahl, die zu nichts auf dem Schirm passt. Was gezählt wird, steht
 * deshalb ausdrücklich darunter.
 */
function summary(overview, done, total) {
  const o = overview
    ? {
        done: overview.done,
        total: overview.total,
        meta: `Teile ${PACK_OVERVIEW_BAGS.find((b) => b.id === overview.bag)?.where || ''}`.trim(),
      }
    : { done, total, meta: done === total ? 'alles beisammen' : `${total - done} noch offen` };

  return h('div.summary',
    h('p.summary__label', 'Eingepackt'),
    h('p.summary__value', o.total ? `${o.done} von ${o.total}` : 'nichts'),
    h('p.summary__meta', o.total ? o.meta : 'in dieser Tasche liegt noch nichts'),
    bar(o.total ? o.done / o.total : 0, 'neutral'),
  );
}

/**
 * Der Umschalter der Übersicht: Beides, Handgepäck, Aufgabegepäck.
 *
 * Bewusst Chips und keine dritte Reiterzeile — über der Übersicht stehen
 * schon zwei (Planung und Packliste), und eine dritte Reihe Text mit
 * Unterstrich wäre von den beiden anderen nicht mehr zu unterscheiden. Chips
 * lesen sich als das, was sie sind: eine Auswahl innerhalb dessen, was
 * darüber schon gewählt ist.
 */
function bagSwitch(current, actions) {
  return h('div.chips.chips--scroll.packbags', { role: 'group', 'aria-label': 'Welches Gepäck' },
    ...PACK_OVERVIEW_BAGS.map((b) =>
      h('button.chip', {
        type: 'button',
        class: b.id === current ? 'is-active' : '',
        'aria-pressed': b.id === current ? 'true' : 'false',
        onclick: () => { overviewBag = b.id; actions.rerender(); },
      }, b.label),
    ),
  );
}

/**
 * Die Übersicht selbst: je Kategorie ein Abschnitt, darin eine Zeile je Sorte.
 *
 * Keine Zeilen zum Antippen — hier wird nichts bearbeitet und nichts abgehakt.
 * Wer etwas ändern will, geht in die Liste zurück; eine Zahl, die sich unter
 * dem Finger als Knopf entpuppt, wäre hier eine Falle.
 *
 * Rechts steht „4 von 6“, solange noch etwas fehlt, und bloß „6“, wenn alles
 * davon im Koffer liegt: „6 von 6“ sagt zweimal dasselbe, und gesucht ist ja
 * gerade die Zeile, an der noch etwas aussteht.
 */
function tally(overview) {
  if (!overview.categories.length) {
    return emptyState('Für dieses Gepäck ist noch nichts eingetragen.');
  }
  const count = (r) => (r.done === r.total ? String(r.total) : `${r.done} von ${r.total}`);
  return h('div.packgroups', ...overview.categories.map((cat) =>
    h('section.section',
      sectionTitle(cat.label, h('span.section__meta', count(cat))),
      h('div.tally', ...cat.rows.map((row) =>
        h('div.tally__row',
          h('span.tally__label', row.label),
          h('span.tally__count', { class: row.done === row.total ? 'is-done' : '' }, count(row)),
        ),
      )),
    ),
  ));
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
let quickSubChips = null;
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
      sub: quickSub,
      bag: tab === 'hand' || tab === 'hold' ? tab : 'none',
    });
  };

  const chips = h('div.chips.chips--scroll');
  const buttons = PACK_CATEGORIES.map((c) => {
    // Ohne Neuaufbau umschalten: der würde den halb getippten Text mitnehmen.
    const b = h('button.chip', { type: 'button', dataset: { id: c.id }, onclick: () => {
      quickCategory = c.id;
      // Die Sorte gehört der Kategorie; wechselt die, ist die alte Wahl keine
      // Angabe mehr — „Sneaker“ bliebe sonst an der nächsten Hose kleben.
      quickSub = '';
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === quickCategory));
      syncQuickSubs();
      quickInput.focus({ preventScroll: true });
    } }, icon(c.icon, 16), c.label);
    b.classList.toggle('is-active', c.id === quickCategory);
    return b;
  });
  chips.append(...buttons);

  quickSubChips = h('div.chips.chips--scroll.packadd__subs');
  syncQuickSubs();

  quickAddEl = h('form.packadd', { onsubmit: (e) => { e.preventDefault(); add(); } },
    chips,
    quickSubChips,
    h('div.packadd__row',
      quickInput,
      h('button.icon-btn.packadd__go', { type: 'submit', 'aria-label': 'Auf die Liste setzen' }, icon('plus', 22)),
    ),
  );
}

/**
 * Die zweite Reihe des Schnellfelds: die Sorten der gewählten Kategorie.
 *
 * Sie wird neu gefüllt statt neu gebaut — das Feld darüber hält den halb
 * getippten Text, und der überlebt keinen Neuaufbau der Maske. Die Sorten sind
 * blasser gezeichnet als die Kategorien darüber: die Kategorie muss stimmen,
 * die Sorte ist ein Angebot. Wo eine Kategorie keine hat („Sonstiges“), fällt
 * die Reihe ganz weg, statt eine einzelne Möglichkeit anzubieten, die nichts
 * aussagt.
 */
function syncQuickSubs() {
  const subs = packSubs(quickCategory);
  quickSubChips.hidden = !subs.length;
  if (!subs.length) {
    replace(quickSubChips);
    return;
  }
  const buttons = [{ id: '', label: 'Ohne Angabe' }, ...subs].map((sub) => {
    const b = h('button.chip.chip--sub', { type: 'button', dataset: { id: sub.id }, onclick: () => {
      quickSub = sub.id;
      buttons.forEach((x) => x.classList.toggle('is-active', x.dataset.id === quickSub));
      quickInput.focus({ preventScroll: true });
    } }, sub.label);
    b.classList.toggle('is-active', sub.id === quickSub);
    return b;
  });
  replace(quickSubChips, ...buttons);
}
