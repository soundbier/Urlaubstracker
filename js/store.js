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
import { todayISO, POT } from './calc.js';

const PERSON_COLORS = ['#f472b6', '#38bdf8', '#a3e635', '#fbbf24'];

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

function makePerson(name, i = 0) {
  return { id: newId(8), name: String(name || '').trim() || `Person ${i + 1}`, share: 1, color: PERSON_COLORS[i % PERSON_COLORS.length] };
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
  set({
    trip,
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

export async function createTrip({ name, startDate, endDate, currency, budgetMode, peopleNames, myIndex = 0, useCloud = false, firebaseConfig = null }) {
  const people = peopleNames.map((n, i) => makePerson(n, i));
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

// --------------------------------------------------------------- Ausgaben

export async function addExpense({ amount, date, category, note, payer }) {
  const now = Date.now();
  const row = {
    id: newId(),
    amount,
    date: date || todayISO(),
    category: category || 'other',
    note: (note || '').trim(),
    payer: payer || POT,
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
