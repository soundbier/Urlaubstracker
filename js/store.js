/**
 * Der Zustand der App und alle Schreibvorgänge.
 *
 * Die Oberfläche liest nur `getState()` und ruft die Aktionen hier auf; welches
 * Backend darunter liegt (localStorage oder Firestore), sieht sie nicht. Das
 * Firestore-Backend wird erst nachgeladen, wenn es gebraucht wird — im lokalen
 * Modus lädt die App kein einziges Byte Firebase.
 */
import { LocalBackend } from './backend-local.js';
import { getPrefs, setPrefs, clearPrefs, validateFirebaseConfig } from './prefs.js';
import { newId, newInviteCode } from './ids.js';
import { todayISO, POT, MAX_PEOPLE, nextPersonColor, personEntryCount, averageShare } from './calc.js';

let backend = null;
const listeners = new Set();

let state = {
  phase: 'loading', // loading | onboarding | ready
  trip: null,
  contributions: [],
  expenses: [],
  myPersonId: null,
  invite: null, // offene Einladung aus dem Link
  sync: {
    mode: 'local',
    ready: false,
    connected: false,
    online: navigator.onLine,
    pending: 0,
    error: null,
    uid: null,
  },
};

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function set(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

function setSync(patch) {
  set({ sync: { ...state.sync, ...patch } });
}

addEventListener('online', () => setSync({ online: true }));
addEventListener('offline', () => setSync({ online: false }));

// ------------------------------------------------------------------- Anlegen

function makePerson(name, i = 0, existing = []) {
  return {
    id: newId(8),
    name: String(name || '').trim() || `Person ${i + 1}`,
    // Wer dazukommt, trägt so viel wie die anderen im Schnitt. Fest 1 wäre
    // falsch, sobald die Gruppe schon eine Aufteilung hat: neben 50/50 stünde
    // die neue Person mit 1 % da, ohne dass das jemand so gemeint hätte.
    share: averageShare(existing),
    color: nextPersonColor(existing),
  };
}

function makeTrip({ name, startDate, endDate, currency = 'EUR', budgetMode = 'dynamic', people }) {
  const now = Date.now();
  return {
    id: newId(),
    name: String(name || '').trim() || 'Unser Urlaub',
    startDate,
    endDate,
    currency,
    budgetMode,
    people,
    createdAt: now,
    updatedAt: now,
  };
}

// -------------------------------------------------------------------- Backend

function handleChange(data) {
  const trip = data.trip;
  // Wer an diesem Gerät sitzt, wird lokal gemerkt — die Person kann aber aus
  // einem anderen Trip stammen (Einladung angenommen) oder inzwischen aus der
  // Gruppe raus sein. Dann lieber gar niemand: die App fragt dann wieder nach,
  // statt Ausgaben stillschweigend niemandem zuzuordnen.
  const myPersonId =
    trip && state.myPersonId && !(trip.people || []).some((p) => p.id === state.myPersonId)
      ? null
      : state.myPersonId;
  if (myPersonId !== state.myPersonId) setPrefs({ myPersonId });

  set({
    trip,
    myPersonId,
    contributions: sortByDate(data.contributions),
    expenses: sortByDate(data.expenses),
    // Eine offene Einladung hat Vorrang, sonst würde sie beim nächsten
    // Datenereignis unter dem Finger verschwinden.
    phase: state.invite ? 'onboarding' : trip ? 'ready' : 'onboarding',
  });
}

function sortByDate(rows) {
  return [...rows].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
}

async function useBackend(next) {
  if (backend) await backend.stop();
  backend = next;
  // Der Fehler des alten Backends gilt für das neue nicht mehr. Wer danach
  // trotzdem einen setzen will, tut das nach diesem Aufruf.
  setSync({ error: null });
  await backend.start(handleChange, (s) => setSync(s));
}

async function makeCloudBackend({ config, tripId, inviteCode }) {
  const { FirestoreBackend } = await import('./backend-firestore.js');
  return new FirestoreBackend({ config, tripId, inviteCode });
}

/**
 * Nimmt eine Einladung aus der Adresszeile entgegen.
 *
 * Das passiert nicht nur beim Start: tippt jemand auf den Link, während die App
 * schon offen ist, springt der Browser nur ans Fragment und lädt nichts neu.
 * Deshalb hören wir zusätzlich auf `hashchange`.
 */
async function consumeInvite() {
  const { readInviteFromLocation, clearInviteFromLocation } = await import('./link.js');
  const invite = readInviteFromLocation();
  if (!invite) return false;
  clearInviteFromLocation();
  // Auch wenn schon ein Trip offen ist: die Einladung wurde bewusst angetippt.
  // Ablehnen führt über `dismissInvite` zurück.
  set({ invite, phase: 'onboarding' });
  return true;
}

/** Startet die App: Einladung im Link prüfen, dann passendes Backend hochfahren. */
export async function init() {
  await consumeInvite();
  addEventListener('hashchange', () => { consumeInvite(); });

  const prefs = getPrefs();
  set({ myPersonId: prefs.myPersonId });

  let cloudProblem = null;
  if (prefs.tripRef?.mode === 'cloud' && prefs.firebaseConfig) {
    try {
      await useBackend(
        await makeCloudBackend({
          config: prefs.firebaseConfig,
          tripId: prefs.tripRef.tripId,
          inviteCode: prefs.tripRef.inviteCode,
        }),
      );
      return;
    } catch (err) {
      // Cloud kaputt? Lieber lokal weiterarbeiten als gar nicht.
      cloudProblem = err?.message || String(err);
    }
  }

  await useBackend(new LocalBackend());
  if (cloudProblem) setSync({ error: cloudProblem });
}

// -------------------------------------------------------------------- Aktionen

/**
 * Neue Kasse anlegen. `peopleNames` steht in der Reihenfolge, in der die Namen
 * eingetippt wurden; `myIndex` sagt, welcher davon an diesem Gerät sitzt.
 */
export async function createTrip({ name, startDate, endDate, currency, budgetMode, peopleNames, myIndex = 0, useCloud = false, firebaseConfig = null }) {
  const people = [];
  for (const [i, n] of peopleNames.slice(0, MAX_PEOPLE).entries()) people.push(makePerson(n, i, people));
  const trip = makeTrip({ name, startDate, endDate, currency, budgetMode, people });
  const me = people[myIndex] || people[0];

  if (useCloud) {
    const problem = validateFirebaseConfig(firebaseConfig);
    if (problem) throw new Error(problem);
    const tripId = newId();
    const inviteCode = newInviteCode();
    const cloud = await makeCloudBackend({ config: firebaseConfig, tripId, inviteCode });
    await cloud.createTrip(trip, { personId: me.id });
    setPrefs({ firebaseConfig, tripRef: { mode: 'cloud', tripId, inviteCode }, myPersonId: me.id });
    set({ myPersonId: me.id });
    await useBackend(cloud);
    return;
  }

  setPrefs({ tripRef: { mode: 'local' }, myPersonId: me.id });
  set({ myPersonId: me.id });
  const local = new LocalBackend();
  await local.createTrip(trip);
  await useBackend(local);
}

/** Einer Einladung folgen — aus dem Link oder mit von Hand eingetippten Daten. */
export async function joinTrip({ tripId, inviteCode, config }) {
  const cfg = config || getPrefs().firebaseConfig;
  const problem = validateFirebaseConfig(cfg);
  if (problem) throw new Error(problem);

  const cloud = await makeCloudBackend({ config: cfg, tripId, inviteCode });
  await cloud.join({ personId: getPrefs().myPersonId });
  setPrefs({ firebaseConfig: cfg, tripRef: { mode: 'cloud', tripId, inviteCode } });
  set({ invite: null, phase: 'loading' });
  await useBackend(cloud);
}

/** Einladung ablehnen — zurück zum eigenen Trip, falls es einen gibt. */
export function dismissInvite() {
  set({ invite: null, phase: state.trip ? 'ready' : 'onboarding' });
}

export async function updateTrip(patch) {
  if (!state.trip) return;
  await backend.saveTrip({ ...state.trip, ...patch, updatedAt: Date.now() });
}

export async function setMyPerson(personId) {
  setPrefs({ myPersonId: personId });
  set({ myPersonId: personId });
  await backend.setMyPerson?.(personId);
}

/**
 * Jemanden aufnehmen — unterwegs kommt wer dazu, oder es tritt jemand bei, der
 * in der Liste noch gar nicht steht. `setAsMe` ist genau der zweite Fall: das
 * Gerät trägt sich selbst ein.
 */
export async function addPerson(name, { setAsMe = false } = {}) {
  if (!state.trip) throw new Error('Es gibt noch keine Urlaubskasse.');
  const people = state.trip.people || [];
  if (people.length >= MAX_PEOPLE) throw new Error(`Mehr als ${MAX_PEOPLE} Personen kann eine Kasse nicht führen.`);
  const person = makePerson(name, people.length, people);
  await updateTrip({ people: [...people, person] });
  if (setAsMe) await setMyPerson(person.id);
  return person;
}

/**
 * Jemanden aus der Gruppe nehmen.
 *
 * Nur solange kein Geld an der Person hängt: eine Einzahlung ohne Einzahler
 * oder eine privat bezahlte Ausgabe ohne Zahler würde die Abrechnung
 * verfälschen, ohne dass es jemandem auffällt. Wer schon eingetragen ist,
 * bleibt deshalb drin — Namen ändern geht weiterhin.
 */
export async function removePerson(personId) {
  const people = state.trip?.people || [];
  const person = people.find((p) => p.id === personId);
  if (!person) return;
  if (people.length <= 1) throw new Error('Eine Person muss bleiben.');
  const used = personEntryCount(personId, { contributions: state.contributions, expenses: state.expenses });
  if (used) {
    throw new Error(
      used === 1
        ? `An „${person.name}“ hängt noch ein Eintrag — den erst ändern, dann geht das Entfernen.`
        : `An „${person.name}“ hängen noch ${used} Einträge — die erst ändern, dann geht das Entfernen.`,
    );
  }
  await updateTrip({ people: people.filter((p) => p.id !== personId) });
  if (state.myPersonId === personId) await setMyPerson(null);
}

// --------------------------------------------------------------- Ausgaben

export async function addExpense({ amount, date, category, note, payer, planned = false, fromPlan = false }) {
  const now = Date.now();
  const row = {
    id: newId(),
    amount,
    date: date || todayISO(),
    category: category || 'other',
    note: (note || '').trim(),
    payer: payer || POT,
    // Vorgemerkt: das Geld ist eingeplant, aber noch nicht ausgegeben.
    planned: planned === true,
    fromPlan: planned !== true && fromPlan === true,
    createdAt: now,
    updatedAt: now,
    createdBy: state.myPersonId || null,
  };
  await backend.putExpense(row);
  return row;
}

export async function updateExpense(id, patch) {
  const row = state.expenses.find((e) => e.id === id);
  if (!row) return;
  await backend.putExpense({ ...row, ...patch, updatedAt: Date.now() });
}

/**
 * Aus einer Vormerkung wird eine echte Ausgabe.
 *
 * Bezahlt wird jetzt — deshalb rückt ein in der Zukunft geplanter Eintrag auf
 * den heutigen Tag. Ein überfälliger behält sein Datum: dann war das Geld an
 * dem Tag weg, an dem es geplant war.
 */
export async function markExpensePaid(id, today = todayISO()) {
  const row = state.expenses.find((e) => e.id === id);
  if (!row || !row.planned) return;
  await backend.putExpense({
    ...row,
    planned: false,
    // Bleibt am Eintrag hängen: das Geld war reserviert und soll auch bezahlt
    // nicht noch einmal vom Tagesbudget abgezogen werden.
    fromPlan: true,
    date: row.date > today ? today : row.date,
    updatedAt: Date.now(),
  });
}

export async function deleteExpense(id) {
  await backend.removeExpense(id);
}

// ------------------------------------------------------------- Einzahlungen

export async function addContribution({ personId, amount, date, note }) {
  const now = Date.now();
  const row = {
    id: newId(),
    personId,
    amount,
    date: date || todayISO(),
    note: (note || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await backend.putContribution(row);
  return row;
}

export async function updateContribution(id, patch) {
  const row = state.contributions.find((c) => c.id === id);
  if (!row) return;
  await backend.putContribution({ ...row, ...patch, updatedAt: Date.now() });
}

export async function deleteContribution(id) {
  await backend.removeContribution(id);
}

// ------------------------------------------------------------------- Sync

/** Den aktuellen lokalen Trip in ein Firebase-Projekt hochladen. */
export async function connectCloud(firebaseConfig) {
  const problem = validateFirebaseConfig(firebaseConfig);
  if (problem) throw new Error(problem);
  if (!state.trip) throw new Error('Es gibt noch keinen Trip zum Hochladen.');

  const tripId = newId();
  const inviteCode = newInviteCode();
  const cloud = await makeCloudBackend({ config: firebaseConfig, tripId, inviteCode });
  await cloud.createTrip(state.trip, { personId: state.myPersonId });
  await cloud.importAll({ contributions: state.contributions, expenses: state.expenses });

  setPrefs({ firebaseConfig, tripRef: { mode: 'cloud', tripId, inviteCode } });
  await useBackend(cloud);
}

/** Zurück in den lokalen Modus — mit einer Kopie des aktuellen Standes. */
export async function disconnectCloud() {
  const copy = { trip: state.trip, contributions: state.contributions, expenses: state.expenses };
  setPrefs({ tripRef: { mode: 'local' } });
  const local = new LocalBackend();
  await local.replaceAll(copy);
  await useBackend(local);
}

export async function rotateInviteCode() {
  const code = newInviteCode();
  await backend.rotateInviteCode?.(code);
  const prefs = getPrefs();
  setPrefs({ tripRef: { ...prefs.tripRef, inviteCode: code } });
  return code;
}

export function getInviteInfo() {
  const prefs = getPrefs();
  if (prefs.tripRef?.mode !== 'cloud') return null;
  return {
    tripId: prefs.tripRef.tripId,
    inviteCode: state.trip?.inviteCode || prefs.tripRef.inviteCode,
    config: prefs.firebaseConfig,
    tripName: state.trip?.name || '',
  };
}

// ------------------------------------------------------------------- Daten

export async function importData(payload) {
  await backend.replaceAll({
    trip: { ...payload.trip, updatedAt: Date.now() },
    contributions: payload.contributions,
    expenses: payload.expenses,
  });
}

/** Trip löschen und zurück auf Anfang. */
export async function deleteTrip() {
  await backend.deleteTrip?.();
  clearPrefs();
  const local = new LocalBackend();
  // Auch eine ältere lokale Kopie muss weg, sonst taucht sie danach wieder auf.
  await local.deleteTrip();
  set({ trip: null, contributions: [], expenses: [], myPersonId: null, invite: null, phase: 'onboarding' });
  await useBackend(local);
}

export function me() {
  return state.trip?.people?.find((p) => p.id === state.myPersonId) || null;
}
