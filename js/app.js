/** Die Hülle: Kopfzeile, Ansichten, Navigation, Schnelleingabe. */
import { h, icon, replace, $ } from './dom.js';
import * as store from './store.js';
import { computeBudget, todayISO } from './calc.js';
import { number, days } from './format.js';
import { toast, confirmSheet } from './ui/sheet.js';
import { expenseSheet, contributionSheet } from './ui/entry-sheets.js';
import { renderToday } from './views/today.js';
import { renderExpenses } from './views/expenses.js';
import { renderBudget } from './views/budget.js';
import { renderSettings } from './views/settings.js';
import { renderOnboarding } from './views/onboarding.js';

const TABS = [
  { id: 'heute', label: 'Heute', icon: 'sun', render: renderToday },
  { id: 'ausgaben', label: 'Ausgaben', icon: 'list', render: renderExpenses },
  { id: 'budget', label: 'Budget', icon: 'chart', render: renderBudget },
  { id: 'mehr', label: 'Mehr', icon: 'gear', render: renderSettings },
];

const app = $('#app');
let state = store.getState();

// ------------------------------------------------------------------ Routing

function currentTab() {
  const id = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  return TABS.find((t) => t.id === id) ? id : 'heute';
}

function goto(tab) {
  if (currentTab() === tab) return;
  location.hash = `#/${tab}`;
}

addEventListener('hashchange', () => render());

// ------------------------------------------------------------------ Aktionen

const actions = {
  goto,
  rerender: () => render(),

  setMyPerson(personId) {
    store.setMyPerson(personId).catch((err) => toast(err?.message || 'Ging nicht.', { type: 'error' }));
  },

  async addExpense(defaults = {}) {
    const result = await expenseSheet({ trip: state.trip, defaults });
    if (result?.action !== 'save') return;
    try {
      await store.addExpense(result.values);
      if (currentTab() === 'mehr') goto('heute');
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async editExpense(expense) {
    const result = await expenseSheet({ trip: state.trip, expense });
    if (!result) return;
    try {
      if (result.action === 'save') {
        await store.updateExpense(expense.id, result.values);
      } else if (result.action === 'delete') {
        const ok = await confirmSheet({ title: 'Eintrag löschen?', confirmLabel: 'Löschen', danger: true });
        if (ok) await store.deleteExpense(expense.id);
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async addContribution(defaults = {}) {
    const result = await contributionSheet({ trip: state.trip, defaults });
    if (result?.action !== 'save') return;
    try {
      await store.addContribution(result.values);
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async editContribution(contribution) {
    const result = await contributionSheet({ trip: state.trip, contribution });
    if (!result) return;
    try {
      if (result.action === 'save') {
        await store.updateContribution(contribution.id, result.values);
      } else if (result.action === 'delete') {
        const ok = await confirmSheet({ title: 'Einzahlung löschen?', confirmLabel: 'Löschen', danger: true });
        if (ok) await store.deleteContribution(contribution.id);
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },
};

// ------------------------------------------------------------------- Aufbau

function render() {
  if (state.phase === 'loading') {
    replace(app, h('div.view.view--center', h('div.spinner', { 'aria-label': 'Lädt' })));
    return;
  }

  if (state.phase === 'onboarding' || !state.trip) {
    document.body.classList.add('is-onboarding');
    replace(app, renderOnboarding(state, actions));
    return;
  }

  document.body.classList.remove('is-onboarding');
  const tab = TABS.find((t) => t.id === currentTab());

  replace(app,
    header(),
    h('main.main', { id: 'main' }, tab.render(state, actions)),
    fab(tab.id),
    nav(tab.id),
  );
  document.title = `${state.trip.name} — Urlaubstracker`;
}

function header() {
  const { trip, sync } = state;
  const today = todayISO();
  const b = computeBudget({ trip, contributions: state.contributions, expenses: state.expenses, today });

  const subtitle =
    b.phase === 'before' ? (b.daysUntilStart === 0 ? 'ab morgen' : `in ${days(b.daysUntilStart)}`)
    : b.phase === 'after' ? 'abgeschlossen'
    : `Tag ${number(b.elapsedDays)} von ${number(b.totalDays)}`;

  const syncTone = sync.mode !== 'cloud' ? 'off' : sync.error ? 'error' : sync.connected ? 'on' : 'pending';
  const syncTitle = {
    off: 'Nur auf diesem Gerät',
    on: 'Synchronisiert',
    pending: sync.online ? 'Verbindet …' : 'Offline — wird nachgereicht',
    error: 'Synchronisierung stockt',
  }[syncTone];

  return h('header.topbar',
    h('div.topbar__main',
      h('h1.topbar__title', trip.name),
      h('p.topbar__sub', subtitle),
    ),
    h('button.syncdot', { type: 'button', class: `syncdot--${syncTone}`, title: syncTitle, 'aria-label': syncTitle, onclick: () => goto('mehr') },
      icon(syncTone === 'on' ? 'cloud' : syncTone === 'off' ? 'cloudOff' : syncTone === 'error' ? 'cloudOff' : 'cloud', 18),
    ),
  );
}

function fab(tabId) {
  // Budget und Einstellungen haben ihre Knöpfe im Inhalt — dort würde der
  // schwebende Knopf nur die Liste verdecken.
  if (tabId === 'budget' || tabId === 'mehr') return null;
  return h('button.fab', {
    type: 'button',
    onclick: () => actions.addExpense(),
    'aria-label': 'Ausgabe eintragen',
  }, icon('plus', 26), h('span.fab__label', 'Ausgabe'));
}

function nav(activeId) {
  return h('nav.nav', { 'aria-label': 'Hauptbereiche' },
    ...TABS.map((t) =>
      h('button.nav__item', {
        type: 'button',
        class: t.id === activeId ? 'is-active' : '',
        'aria-current': t.id === activeId ? 'page' : null,
        onclick: () => goto(t.id),
      }, icon(t.icon, 22), h('span.nav__label', t.label)),
    ),
  );
}

// -------------------------------------------------------------------- Start

store.subscribe((next) => {
  // Nur nach dem Anlegen bzw. Beitreten auf „Heute“ springen. Beim Kaltstart
  // muss ein Deeplink wie #/budget stehen bleiben — daran hängt auch die
  // App-Verknüpfung aus dem Manifest.
  const cameFromOnboarding = state.phase === 'onboarding' && next.phase === 'ready';
  state = next;
  render();
  if (cameFromOnboarding && currentTab() !== 'heute') goto('heute');
});

store.init().catch((err) => {
  console.error(err);
  toast(err?.message || 'Start fehlgeschlagen.', { type: 'error' });
});

// --------------------------------------------------------------- Offline-Hülle

if ('serviceWorker' in navigator) {
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Neue Version verfügbar — App neu laden.', { duration: 8000 });
          }
        });
      });
    } catch {
      // Ohne Service Worker läuft die App weiterhin, nur eben nicht offline.
    }
  });
}
