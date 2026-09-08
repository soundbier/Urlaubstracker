/** Die Hülle: Kopfzeile, Ansichten, Navigation, Schnelleingabe. */
import { h, icon, replace, $ } from './dom.js';
import * as store from './store.js';
import { computeBudget, todayISO, packStatus } from './calc.js';
import { applyTheme } from './prefs.js';
import { onInstallabilityChange } from './install.js';
import { money, days, compactDate } from './format.js';
import { toast, confirmSheet, promptSheet, closeAllSheets, hideToast } from './ui/sheet.js';
import * as lock from './lock.js';
import { lockScreen } from './ui/lock-screen.js';
import { expenseSheet, contributionSheet, cashOutSheet, planItemSheet, packItemSheet } from './ui/entry-sheets.js';
import { renderToday } from './views/today.js';
import { renderFinances, financePane, setFinancePane } from './views/finances.js';
import { renderSettings } from './views/settings.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderAuth } from './views/auth.js';
import { renderTrips } from './views/trips.js';
import { renderPlanning, planningPane } from './views/planning.js';
import { packingScope } from './views/packing.js';

/**
 * Vier Ziele, in der Reihenfolge, in der man sie im Urlaub braucht: was steht
 * heute an, was steht diese Woche an, was kostet das — und der Rest.
 */
const TABS = [
  { id: 'heute', label: 'Heute', icon: 'sun', render: renderToday },
  { id: 'plan', label: 'Planung', icon: 'calendar', render: renderPlanning },
  { id: 'finanzen', label: 'Finanzen', icon: 'wallet', render: renderFinances },
  { id: 'mehr', label: 'Mehr', icon: 'gear', render: renderSettings },
];

/**
 * „Ausgaben“ und „Budget“ waren einmal zwei Reiter und sind jetzt zwei
 * Unter-Reiter von „Finanzen“. Alte Lesezeichen, die App-Verknüpfung aus dem
 * Manifest und der Zurück-Knopf sollen trotzdem dort landen, wo der Inhalt
 * heute steht.
 */
const LEGACY_ROUTES = { ausgaben: 'finanzen', budget: 'finanzen' };

const app = $('#app');
let state = store.getState();

// ------------------------------------------------------------------ Routing

function currentTab() {
  const id = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  if (LEGACY_ROUTES[id]) return LEGACY_ROUTES[id];
  return TABS.find((t) => t.id === id) ? id : 'heute';
}

/**
 * Eine alte Adresse wird zur neuen — samt passendem Unter-Reiter: `#/budget`
 * führt auf die Kasse, `#/ausgaben` auf die Liste. Die Adresse wird dabei
 * ersetzt, nicht angehängt, damit der Zurück-Knopf nicht zwischen alter und
 * neuer Schreibweise hin und her springt.
 */
function consumeLegacyRoute() {
  const id = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  if (!LEGACY_ROUTES[id]) return;
  setFinancePane(id === 'budget' ? 'kasse' : 'ausgaben');
  history.replaceState(null, '', `${location.pathname}${location.search}#/${LEGACY_ROUTES[id]}`);
}

function goto(tab) {
  if (currentTab() === tab) return;
  location.hash = `#/${tab}`;
}

/**
 * `#/neu` ist keine Ansicht, sondern ein Auftrag: „Ausgabe eintragen“.
 *
 * Daran hängt die App-Verknüpfung aus dem Manifest. Bisher führte sie nur auf
 * „Heute“ — man musste den Knopf trotzdem noch suchen. Die Adresse wird sofort
 * wieder auf `#/heute` gesetzt: damit ist der Auftrag verbraucht, der
 * Zurück-Knopf bleibt sauber, und ein erneuter Tipp auf die Verknüpfung wirkt
 * wieder.
 */
function consumeQuickAdd() {
  if (!/^#\/neu(?:$|[/?&])/.test(location.hash)) return;
  // Beim Kaltstart ist der Trip noch nicht da — dann gleich noch einmal.
  if (state.phase === 'loading') return;
  // Und hinter der Gerätesperre wird gar nichts eingetragen: die Maske läge
  // sonst unsichtbar hinter dem Sperrbildschirm.
  if (lock.isLocked()) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#/heute`);
  if (state.phase === 'ready' && state.trip) actions.addExpense();
}

addEventListener('hashchange', () => { consumeLegacyRoute(); render(); consumeQuickAdd(); });

// ------------------------------------------------------------------ Aktionen

/**
 * Rückmeldung mit einem Weg zurück.
 *
 * Ohne sie war ein Vertipper teuer: Zeile suchen, öffnen, löschen, bestätigen —
 * vier Schritte für etwas, das gerade eben passiert ist. Und ganz ohne
 * Rückmeldung bleibt offen, ob überhaupt etwas angekommen ist; in der Gruppe
 * trägt dann schnell jemand dieselbe Runde ein zweites Mal ein.
 */
function undoable(message, undo) {
  toast(message, {
    type: 'success',
    action: {
      label: 'Rückgängig',
      onClick: () => {
        Promise.resolve(undo()).catch((err) => toast(err?.message || 'Ging nicht.', { type: 'error' }));
      },
    },
  });
}

const actions = {
  goto,
  rerender: () => render(),

  setMyPerson(personId) {
    store.setMyPerson(personId).catch((err) => toast(err?.message || 'Ging nicht.', { type: 'error' }));
  },

  /**
   * Jemanden aufnehmen — aus den Einstellungen heraus, oder von „Heute“, wenn
   * das Gerät noch niemandem gehört (`setAsMe`). Beides fragt nur nach dem
   * Namen: alles Weitere lässt sich danach in den Einstellungen ändern.
   */
  async addPerson({ setAsMe = false } = {}) {
    if (!state.trip) return;
    const taken = state.trip.people.map((p) => p.name.trim().toLowerCase());
    const name = await promptSheet({
      title: setAsMe ? 'Wer bist du?' : 'Person hinzufügen',
      subtitle: setAsMe ? 'Der Name steht danach an deinen Einträgen und in der Abrechnung.' : 'Kommt jemand später dazu, zählt ab hier alles mit.',
      label: 'Name',
      placeholder: setAsMe ? 'Dein Name' : 'Name',
      confirmLabel: 'Hinzufügen',
      validate: (v) => (taken.includes(v.toLowerCase()) ? 'Diesen Namen gibt es in der Gruppe schon.' : null),
    });
    if (!name) return;
    try {
      const person = await store.addPerson(name, { setAsMe });
      toast(setAsMe ? `Willkommen, ${person.name}.` : `${person.name} ist dabei.`, { type: 'success' });
    } catch (err) {
      toast(err?.message || 'Ging nicht.', { type: 'error' });
    }
  },

  async addExpense(defaults = {}) {
    const result = await expenseSheet({ trip: state.trip, defaults });
    if (result?.action !== 'save') return;
    try {
      const row = await store.addExpense(result.values);
      if (currentTab() === 'mehr') goto('heute');
      undoable(
        `${money(row.amount, state.trip.currency)} ${row.planned ? 'vorgemerkt' : 'eingetragen'}`,
        () => store.deleteExpense(row.id),
      );
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  /**
   * Dieselbe Ausgabe noch einmal, mit dem heutigen Datum.
   *
   * Kaffee, Parken, Maut: derselbe Betrag, dieselbe Kategorie, zweimal am Tag.
   * Über die Eingabemaske sind das jedes Mal vier Handgriffe für etwas, das
   * schon dasteht. Der Knopf trägt sofort ein statt die Maske vorauszufüllen —
   * das ist der ganze Sinn — und der Rückgängig-Knopf im Toast fängt den
   * Fehlgriff auf.
   */
  async repeatExpense(expense) {
    try {
      const row = await store.addExpense({
        amount: expense.amount,
        category: expense.category,
        note: expense.note,
        payer: expense.payer,
        date: todayISO(),
      });
      undoable(`${money(row.amount, state.trip.currency)} nochmal eingetragen`, () => store.deleteExpense(row.id));
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  /** Aus einer Vormerkung wird eine bezahlte Ausgabe — ein Tipp auf den Haken. */
  async markExpensePaid(expense) {
    // Der Haken sitzt direkt neben der Zeile und ist schnell mal daneben
    // getippt. Was `markExpensePaid` ändert, wird hier vorher festgehalten.
    const before = { planned: true, fromPlan: false, date: expense.date };
    try {
      await store.markExpensePaid(expense.id);
      undoable('Als bezahlt eingetragen.', () => store.updateExpense(expense.id, before));
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
      const row = await store.addContribution(result.values);
      undoable(`${money(row.amount, state.trip.currency)} eingezahlt`, () => store.deleteContribution(row.id));
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

  async addCashOut(defaults = {}) {
    const result = await cashOutSheet({ trip: state.trip, defaults });
    if (result?.action !== 'save') return;
    try {
      const row = await store.addCashOut(result.values);
      undoable(`${money(row.amount, state.trip.currency)} Bargeld ausgezahlt`, () => store.deleteCashOut(row.id));
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async editCashOut(cashOut) {
    const result = await cashOutSheet({ trip: state.trip, cashOut });
    if (!result) return;
    try {
      if (result.action === 'save') {
        await store.updateCashOut(cashOut.id, result.values);
      } else if (result.action === 'delete') {
        const ok = await confirmSheet({ title: 'Bargeld-Auszahlung löschen?', confirmLabel: 'Löschen', danger: true });
        if (ok) await store.deleteCashOut(cashOut.id);
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async addPlanItem(defaults = {}) {
    const result = await planItemSheet({ trip: state.trip, defaults });
    if (result?.action !== 'save') return;
    try {
      const row = await store.addPlanItem(result.values);
      undoable(`„${row.title}“ eingeplant`, () => store.deletePlanItem(row.id));
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async editPlanItem(item) {
    const linked = item.linkedExpenseId ? state.expenses.find((e) => e.id === item.linkedExpenseId) : null;
    const result = await planItemSheet({ trip: state.trip, planItem: item, linkedExpense: linked });
    if (!result) return;
    try {
      if (result.action === 'save') {
        await store.updatePlanItem(item.id, result.values);
      } else if (result.action === 'delete') {
        // Eine noch offene Vormerkung geht mit weg — das steht in der
        // Rückfrage, damit es niemanden überrascht.
        const stillOpen = linked?.planned;
        const ok = await confirmSheet({
          title: 'Programmpunkt löschen?',
          text: stillOpen ? `Die vorgemerkten ${money(linked.amount, state.trip.currency)} werden mit entfernt.` : undefined,
          confirmLabel: 'Löschen',
          danger: true,
        });
        if (ok) await store.deletePlanItem(item.id);
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  /** Der Haken im Reiseplan — in beide Richtungen, siehe `store.markPlanItemDone/Open`. */
  async togglePlanItem(item) {
    const linked = item.linkedExpenseId ? state.expenses.find((e) => e.id === item.linkedExpenseId) : null;
    const done = item.done || (linked ? !linked.planned : false);
    try {
      if (done) {
        await store.markPlanItemOpen(item.id);
        undoable('Zurück auf offen.', async () => {
          await store.updatePlanItem(item.id, { done: true });
          if (linked?.fromPlan) await store.updateExpense(linked.id, { planned: false, fromPlan: true });
        });
      } else {
        await store.markPlanItemDone(item.id);
        undoable('Als erledigt eingetragen.', async () => {
          await store.updatePlanItem(item.id, { done: false });
          if (linked?.planned) await store.updateExpense(linked.id, { planned: true, fromPlan: false, date: linked.date });
        });
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async addPackItem(defaults = {}) {
    const result = await packItemSheet({ defaults });
    if (result?.action !== 'save') return;
    try {
      const row = await store.addPackItem(result.values);
      undoable(`„${row.title}“ steht auf der Liste`, () => store.deletePackItem(row.id));
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  /**
   * Der Weg über das Schnellfeld: eintragen, ohne dass etwas aufgeht.
   *
   * Bewusst ohne Meldung — die neue Zeile erscheint unmittelbar unter dem Feld,
   * und wer zehn Sachen hintereinander eintippt, will nicht zehnmal einen
   * Balken über der Liste haben. Geht es schief, sagt das natürlich trotzdem
   * jemand.
   */
  async addPackItemQuick(values) {
    try {
      await store.addPackItem(values);
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  async editPackItem(item) {
    const result = await packItemSheet({ packItem: item });
    if (!result) return;
    try {
      if (result.action === 'save') {
        await store.updatePackItem(item.id, result.values);
      } else if (result.action === 'delete') {
        const ok = await confirmSheet({ title: `„${item.title}“ von der Liste nehmen?`, confirmLabel: 'Löschen', danger: true });
        if (ok) await store.deletePackItem(item.id);
      }
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },

  /**
   * Der Haken an der Zeile: eingepackt und wieder zurück.
   *
   * Zurück heißt „noch offen“ — welcher Stand vorher dastand, weiß der Eintrag
   * nicht mehr. Wer sich vertippt, holt ihn über „Rückgängig“ zurück; dort
   * steht der alte Stand noch.
   */
  async togglePackItem(item) {
    const before = packStatus(item);
    try {
      await store.updatePackItem(item.id, { status: before === 'packed' ? 'open' : 'packed' });
      undoable(before === 'packed' ? 'Wieder ausgepackt.' : 'Eingepackt.', () => store.updatePackItem(item.id, { status: before }));
    } catch (err) {
      toast(err?.message || 'Konnte nicht gespeichert werden.', { type: 'error' });
    }
  },
};

// ------------------------------------------------------------------- Aufbau

// Der Sperrbildschirm wird gehalten, nicht bei jedem Aufbau neu gebaut: sonst
// wischt eine Änderung aus der Cloud die halb eingetippten Ziffern weg —
// dahinter ändert sich ja ständig etwas, während jemand davor tippt.
let lockScreenEl = null;

function render() {
  // Zugesperrt heißt: nichts von der Kasse steht auf dem Schirm. Kein Kopf,
  // keine Liste, keine Zahl — nur der Code.
  if (lock.isLocked()) {
    document.body.classList.remove('is-onboarding');
    // Auch der Fenstertitel: er steht im App-Umschalter des Systems, und dort
    // hätte der Name der Kasse hinter der Sperre nichts verloren.
    document.title = 'Urlaubstracker';
    if (!lockScreenEl?.isConnected) {
      lockScreenEl = lockScreen({ onUnlocked: () => render() });
      replace(app, lockScreenEl);
    }
    return;
  }
  lockScreenEl = null;

  if (state.phase === 'loading') {
    replace(app, h('div.view.view--center', h('div.spinner', { 'aria-label': 'Lädt' })));
    return;
  }

  // Vor allem anderen: solange auf diesem Gerät noch nicht entschieden ist, ob
  // hier jemand mit Konto oder allein rechnet, steht diese Frage im Weg — mit
  // „Nur auf diesem Gerät“ als vollwertiger dritter Antwort.
  if (store.needsAccountScreen()) {
    document.body.classList.add('is-onboarding');
    replace(app, renderAuth(state, actions));
    return;
  }

  // Angemeldet, aber keine Kasse offen (oder ausdrücklich hierher zurück):
  // die Übersicht aller Kassen dieses Kontos.
  if (store.needsTripList()) {
    document.body.classList.add('is-onboarding');
    replace(app, renderTrips(state, actions));
    return;
  }

  if (state.phase === 'onboarding' || !state.trip) {
    document.body.classList.add('is-onboarding');
    replace(app, renderOnboarding(state, actions));
    return;
  }

  document.body.classList.remove('is-onboarding');
  const route = currentTab();
  const tab = TABS.find((t) => t.id === route);

  replace(app,
    header(),
    deletionBar(),
    h('main.main', { id: 'main' }, tab.render(state, actions)),
    fab(route),
    nav(route),
  );
  document.title = `${state.trip.name} — Urlaubstracker`;
}

function header() {
  const { trip, sync } = state;
  const today = todayISO();
  const b = computeBudget({ trip, contributions: state.contributions, expenses: state.expenses, today });

  // Im laufenden Urlaub steht hier der Zeitraum, nicht der Tagesstand: „Tag 5
  // von 14“ sagt die Datumszeile auf „Heute“ schon, und zweimal dieselbe
  // Auskunft übereinander ist eine zu viel.
  const subtitle =
    b.phase === 'before' ? (b.daysUntilStart === 0 ? 'ab morgen' : `in ${days(b.daysUntilStart)}`)
    : b.phase === 'after' ? 'abgeschlossen'
    : `${compactDate(trip.startDate)} – ${compactDate(trip.endDate)}`;

  const syncTone = sync.error ? 'error' : sync.mode !== 'cloud' ? 'off' : sync.connected ? 'on' : 'pending';
  const syncTitle = {
    off: 'Nur auf diesem Gerät',
    on: 'Synchronisiert',
    pending: sync.online ? 'Verbindet …' : 'Offline — wird nachgereicht',
    error: sync.mode === 'cloud' ? 'Synchronisierung stockt' : 'Wird nicht gespeichert',
  }[syncTone];

  return h('header.topbar',
    h('div.topbar__main',
      h('h1.topbar__title', trip.name),
      h('p.topbar__sub', subtitle),
    ),
    h('div.topbar__icons',
      h('button.syncdot', { type: 'button', class: `syncdot--${syncTone}`, title: syncTitle, 'aria-label': syncTitle, onclick: () => goto('mehr') },
        icon(syncTone === 'on' ? 'cloud' : syncTone === 'off' ? 'cloudOff' : syncTone === 'error' ? 'cloudOff' : 'cloud', 18),
      ),
    ),
  );
}

/**
 * Der Balken, der über einem offenen Löschauftrag steht.
 *
 * Er gehört unter den Kopf und nicht in die Einstellungen: eine Kasse, die in
 * 24 Stunden verschwindet, ist keine Nachricht für die, die zufällig
 * nachsehen. Stoppen darf ihn jedes Gerät der Gruppe — dafür ist die
 * Bedenkzeit da.
 */
function deletionBar() {
  const request = store.deletionRequest();
  if (!request) return null;

  const when = new Date(request.dueAt);
  const stop = h('button.notice__action', {
    type: 'button',
    onclick: async () => {
      stop.disabled = true;
      try {
        await store.cancelTripDeletion();
        toast('Löschen gestoppt.', { type: 'success' });
      } catch (err) {
        stop.disabled = false;
        toast(err?.message || 'Ging nicht.', { type: 'error' });
      }
    },
  }, 'Stoppen');

  return h('div.notice.notice--danger', { role: 'status' },
    icon('trash', 18),
    h('div.notice__main',
      h('p.notice__title', request.due ? 'Diese Kasse ist zum Löschen freigegeben' : 'Diese Kasse soll gelöscht werden'),
      h('p.notice__text', request.due
        ? `${request.person ? `${request.person.name} hat` : 'Ein Gerät hat'} das Löschen beantragt, die Bedenkzeit ist um. Bis es jemand ausführt, könnt ihr es hier noch stoppen.`
        : `${request.person ? `${request.person.name} hat` : 'Ein Gerät hat'} das Löschen beantragt. Ausgeführt werden kann es ab ${when.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}, ${when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr — bis dahin gilt: ein Tipp auf „Stoppen“, und alles bleibt.`),
    ),
    stop,
  );
}

function fab(route) {
  // Die Kasse und die Einstellungen haben ihre Knöpfe im Inhalt — dort würde
  // der schwebende Knopf nur die Liste verdecken.
  if (route === 'mehr') return null;
  if (route === 'finanzen' && financePane() !== 'ausgaben') return null;
  if (route === 'plan') {
    // Zwei Reiter, zwei Sorten Eintrag: unter „Tagesplanung“ ein Programmpunkt,
    // unter „Packliste“ ein Ding, das mit muss.
    const packing = planningPane() === 'packliste';
    // Auf der eigenen Liste ohne gewählte Person gibt es nichts einzutragen —
    // der Bildschirm selbst fragt in dem Fall nach, wer hier sitzt.
    if (packing && packingScope() === 'mine' && !state.myPersonId) return null;
    return h('button.fab', {
      type: 'button',
      onclick: () => (packing ? actions.addPackItem({ shared: packingScope() === 'shared' }) : actions.addPlanItem()),
      'aria-label': packing ? 'Auf die Packliste setzen' : 'Programmpunkt eintragen',
    }, icon('plus', 24));
  }
  return h('button.fab', {
    type: 'button',
    onclick: () => actions.addExpense(),
    'aria-label': 'Ausgabe eintragen',
  }, icon('plus', 24));
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

// Die Farbwahl steht schon als `data-theme` am <html> (siehe index.html) —
// hier zieht nur noch die Adressleiste nach.
applyTheme();

// Eine alte Adresse (`#/ausgaben`, `#/budget`) noch vor dem ersten Aufbau auf
// die neue umschreiben — sonst blitzt beim Kaltstart der falsche Reiter auf.
consumeLegacyRoute();

// `beforeinstallprompt` trifft oft erst nach dem ersten Aufbau ein — dann
// muss die Installations-Zeile (Einstellungen, Einladungsbildschirm)
// nachträglich auftauchen, ohne dass jemand die Ansicht wechseln muss.
onInstallabilityChange(() => render());

// Die Gerätesperre hängt nicht am Trip-Zustand, muss aber dasselbe Bild
// austauschen. Beim Zusperren fliegen offene Sheets mit zu — in ihnen stehen
// Beträge, Namen und im schlimmsten Fall die Beitrittsdaten.
lock.subscribe((s) => {
  if (s.locked) {
    closeAllSheets();
    hideToast();
  }
  render();
});

store.subscribe((next) => {
  // Nur nach dem Anlegen bzw. Beitreten auf „Heute“ springen. Beim Kaltstart
  // muss ein Deeplink wie #/budget stehen bleiben — daran hängt auch die
  // App-Verknüpfung aus dem Manifest.
  const cameFromOnboarding = state.phase === 'onboarding' && next.phase === 'ready';
  state = next;
  render();
  if (cameFromOnboarding && currentTab() !== 'heute') goto('heute');
  consumeQuickAdd();
});

store.init().catch((err) => {
  console.error(err);
  toast(err?.message || 'Start fehlgeschlagen.', { type: 'error' });
});

// ------------------------------------------------- Offline-Hülle und Updates

/**
 * Beim Entwickeln steht der Service Worker im Weg: er liefert aus seinem
 * Cache, und der wird erst bei einer neuen APP_VERSION ausgetauscht. Auf
 * localhost bleibt er deshalb aus — mit `?sw=1` lässt er sich anschalten, um
 * den Update-Ablauf auszuprobieren.
 */
function serviceWorkerWanted() {
  if (!('serviceWorker' in navigator)) return false;
  if (new URLSearchParams(location.search).has('sw')) return true;
  return !['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
}

/**
 * Fragt einen bestimmten Worker nach seiner Fassung. Über einen eigenen Kanal,
 * damit die Antwort eindeutig von ihm kommt und nicht vom gerade laufenden.
 * Antwortet er nicht (ältere Fassung ohne diesen Handler), geht es ohne Nummer
 * weiter — daran soll das Update nicht scheitern.
 */
function askVersion(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const giveUp = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => { clearTimeout(giveUp); resolve(e.data); };
    try {
      worker.postMessage({ type: 'VERSION' }, [channel.port2]);
    } catch {
      clearTimeout(giveUp);
      resolve(null);
    }
  });
}

async function setupServiceWorker() {
  let reg;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch {
    return; // Ohne Service Worker läuft die App weiter, nur eben nicht offline.
  }

  // Nur nach bewusstem „Jetzt aktualisieren“ neu laden. Der Wechsel passiert
  // auch beim allerersten Einrichten — da gibt es nichts neu zu laden.
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating) return;
    updating = false;
    location.reload();
  });

  // Einmal pro Start fragen. Wer „Später“ wählt, wird nicht weiter behelligt;
  // beim nächsten Start steht das Update wieder da.
  let asked = false;
  const offerUpdate = async (worker) => {
    if (asked || !worker) return;
    asked = true;
    const version = await askVersion(worker);
    const ok = await confirmSheet({
      title: version ? `Update auf Version ${version}` : 'Update verfügbar',
      text: 'Die neue Fassung ist bereits heruntergeladen — das Aktualisieren geht auch ohne Netz. Die App startet dabei einmal neu, eure Einträge bleiben.',
      confirmLabel: 'Jetzt aktualisieren',
      cancelLabel: 'Später',
    });
    if (!ok) return;
    updating = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  // Ein Update, das beim letzten Mal liegen geblieben ist.
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

  // Und eines, das während dieser Sitzung fertig wird.
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(sw);
    });
  });

  // Nicht darauf verlassen, wann der Browser von sich aus nachsieht: bei jedem
  // Start einmal nachfragen, damit „beim Neustart“ auch wirklich stimmt.
  reg.update().catch(() => {});
}

if (serviceWorkerWanted()) addEventListener('load', setupServiceWorker);
