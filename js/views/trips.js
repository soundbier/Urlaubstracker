/**
 * „Deine Kassen“ — der Bildschirm nach dem Anmelden.
 *
 * Oben alles, worin dieses Konto mitfährt, unten die zwei Wege zu einer
 * weiteren: beitreten oder neu anlegen. Das ist der einzige Ort in der App,
 * an dem mehr als eine Kasse gleichzeitig zu sehen ist — dahinter rechnet
 * alles weiter mit genau einer (siehe `store.js`, `openTrip`).
 *
 * Die Liste kommt frisch aus Firestore, nicht aus einem Zwischenspeicher: sie
 * steht selten auf dem Schirm, und eine veraltete Übersicht wäre genau hier
 * am ärgerlichsten — nämlich dann, wenn jemand gerade in eine Kasse
 * aufgenommen wurde und sie nicht findet.
 */
import { h, icon, replace } from '../dom.js';
import { toast } from '../ui/sheet.js';
import { joinSheet } from '../ui/join-sheet.js';
import { compactDate } from '../format.js';
import { daysInclusive, todayISO } from '../calc.js';
import * as store from '../store.js';

export function renderTrips(state, actions) {
  const list = h('div.stack');
  const message = h('p.field__error');

  async function reload() {
    replace(list, h('div.view--center', h('div.spinner', { 'aria-label': 'Lädt' })));
    message.textContent = '';
    try {
      const trips = await store.loadMyTrips();
      replace(list, trips.length
        ? h('div.list', ...trips.map((t) => tripRow(t, actions, message)))
        : emptyState());
    } catch (err) {
      replace(list, null);
      message.textContent = err?.message || String(err);
    }
  }

  // Beim ersten Aufbau laden; danach nur noch auf Wunsch, damit nicht jedes
  // Neuzeichnen eine Abfrage auslöst. `loadMyTrips` setzt selbst
  // `tripsLoading`, und das löst über `store.subscribe` ein volles
  // Neuzeichnen der App aus — landen wir also während eines laufenden Ladens
  // hier erneut, darf das kein zweites `reload()` anstoßen: sonst jagt sich
  // das für immer selbst (Laden → Neuzeichnen → Laden → …) und der Kreis
  // dreht sich, ohne je anzukommen.
  //
  // Dasselbe gilt für ein Konto ganz ohne gemeinsame Kasse: `myTrips.length`
  // ist dann dauerhaft 0, genau wie vor dem ersten Laden — ohne `tripsLoaded`
  // wäre das ununterscheidbar, und jedes Neuzeichnen (das Laden selbst löst
  // ja eins aus) hätte wieder `reload()` angestoßen. Für immer.
  if (state.myTrips.length) {
    replace(list, h('div.list', ...state.myTrips.map((t) => tripRow(t, actions, message))));
  } else if (state.tripsLoading) {
    replace(list, h('div.view--center', h('div.spinner', { 'aria-label': 'Lädt' })));
  } else if (state.tripsLoaded) {
    replace(list, emptyState());
  } else {
    reload();
  }

  const account = state.account || {};

  return h('div.view.trips',
    h('header.trips__head',
      h('div',
        h('h1.trips__title', 'Deine Kassen'),
        account.displayName || account.email
          ? h('p.trips__sub', `Angemeldet als ${account.displayName || account.email}`)
          : null,
      ),
      h('button.icon-btn', { type: 'button', title: 'Neu laden', 'aria-label': 'Neu laden', onclick: reload }, icon('repeat', 20)),
    ),
    message,
    list,
    // Die zwei Wege stehen unten, wie im Auftrag beschrieben — und abgesetzt,
    // damit sie nicht wie ein weiterer Listeneintrag wirken.
    h('div.trips__actions',
      h('button.btn.btn--wide', {
        type: 'button',
        onclick: async () => { if (await joinSheet()) toast('Du bist dabei.', { type: 'success' }); },
      }, icon('people', 18), 'Bestehender Kasse beitreten'),
      h('button.btn.btn--primary.btn--wide', {
        type: 'button',
        onclick: () => { store.startNewTrip(); actions.rerender(); },
      }, icon('plus', 18), 'Neue Kasse anlegen'),
      h('button.btn.btn--ghost.btn--small', {
        type: 'button',
        onclick: async () => { await store.signOutAccount(); actions.rerender(); },
      }, 'Abmelden'),
    ),
  );
}

function tripRow(trip, actions, message) {
  const when = trip.startDate && trip.endDate
    ? `${compactDate(trip.startDate)} – ${compactDate(trip.endDate)}`
    : 'Ohne Zeitraum';
  const people = trip.memberCount === 1 ? '1 Mitglied' : `${trip.memberCount} Mitglieder`;

  const open = async () => {
    button.disabled = true;
    message.textContent = '';
    try {
      await store.openTrip(trip);
      actions.rerender();
    } catch (err) {
      message.textContent = err?.message || String(err);
      button.disabled = false;
    }
  };

  const button = h('button.prow__open', { type: 'button', onclick: open },
    h('span.row__icon', icon('wallet', 20)),
    h('span.row__main',
      h('span.row__title', trip.name),
      h('span.row__sub',
        h('span', when),
        h('span.tag', people),
        // Ein laufender Löschauftrag ist das Einzige, was hier drängt.
        trip.deleteRequestedAt ? h('span.tag.tag--due', 'Löschung läuft') : null,
        upcoming(trip),
      ),
    ),
    // Derselbe gedrehte Pfeil wie in den Einstellungen (`srow__chevron`):
    // ungedreht zeigt er nach unten und verspräche ein Aufklappen.
    h('span.srow__chevron', icon('chevron', 18)),
  );

  return h('div.prow', button);
}

/** „läuft“ oder „in 12 Tagen“ — nur, wo es etwas zu sagen gibt. */
function upcoming(trip) {
  if (!trip.startDate || !trip.endDate) return null;
  const today = todayISO();
  if (today >= trip.startDate && today <= trip.endDate) return h('span.tag.tag--now', 'läuft');
  if (today < trip.startDate) {
    const days = daysInclusive(today, trip.startDate) - 1;
    if (days <= 30) return h('span.tag', days === 0 ? 'ab morgen' : `in ${days} Tagen`);
  }
  return null;
}

function emptyState() {
  return h('div.hero.hero--muted',
    h('p.hero__title', 'Noch keine Kasse'),
    h('p.hero__sub', 'Leg eine an oder tritt einer bei — beides unten.'),
  );
}
