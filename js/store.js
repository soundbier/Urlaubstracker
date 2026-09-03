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
import { newId } from './ids.js';
import { joinKeysFor, joinProofFor, checkJoinName, checkNewPassword } from './join.js';
import { keepCopy, lastCopy, discardCopy } from './trash.js';
import { todayISO, POT, MAX_PEOPLE, nextPersonColor, personEntryCount, averageShare } from './calc.js';

let backend = null;
const listeners = new Set();

let state = {
  phase: 'loading', // loading | onboarding | ready
  trip: null,
  contributions: [],
  expenses: [],
  cashOuts: [],
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

function makeTrip({ name, joinName, startDate, endDate, currency = 'EUR', budgetMode = 'dynamic', people }) {
  const now = Date.now();
  return {
    id: newId(),
    name: String(name || '').trim() || 'Unser Urlaub',
    // Der Beitrittsname steht fest, sobald die Kasse angelegt ist: an ihm hängt
    // die Kennung des Dokuments. Umbenennen ändert die Überschrift, nicht die
    // Adresse — sonst käme nach jedem Umbenennen niemand mehr rein.
    joinName: String(joinName || name || '').trim() || 'Unser Urlaub',
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
    cashOuts: sortByDate(data.cashOuts || []),
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
 * Auf etwas warten, das über das Netz geht — aber nicht endlos.
 *
 * Firestore löst einen Schreibvorgang erst auf, wenn der Server ihn bestätigt
 * hat. Ohne Empfang bleibt das Versprechen offen, und die Oberfläche stünde mit
 * gesperrtem Knopf da, ohne je eine Antwort zu bekommen.
 */
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

const NO_CONNECTION = 'Das dauert zu lange — dafür braucht es Empfang. Versuch es gleich noch einmal.';

// -------------------------------------------------- Firebase-Konfiguration

/**
 * Die Konfiguration der Auslieferung.
 *
 * Liegt neben `index.html` eine `firebase-config.json`, gilt sie für alle, die
 * diese Adresse öffnen — und dann reichen Name und Passwort wirklich aus, um
 * beizutreten. Ohne die Datei bleibt es beim alten Weg: die Konfiguration
 * kommt einmal von Hand ins Gerät oder über einen Einladungslink.
 */
let ambientConfig = null;
let ambientLoaded = false;

async function loadAmbientConfig() {
  if (ambientLoaded) return ambientConfig;
  ambientLoaded = true;
  try {
    const res = await withTimeout(fetch('./firebase-config.json'), 4000, 'zu langsam');
    if (!res.ok) return null; // Die Datei ist optional — 404 ist der Normalfall.
    const cfg = await res.json();
    ambientConfig = validateFirebaseConfig(cfg) ? null : cfg;
  } catch {
    ambientConfig = null;
  }
  return ambientConfig;
}

/** Die Konfiguration, mit der dieses Gerät in die Cloud kommt — falls es eine gibt. */
export function cloudConfig() {
  return getPrefs().firebaseConfig || ambientConfig;
}

/** Kann dieses Gerät ohne weitere Einrichtung eine geteilte Kasse anlegen? */
export function cloudReady() {
  return !!cloudConfig();
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

  // Vor dem ersten Bild: sonst baut sich der Anlege-Bildschirm neu auf, während
  // schon jemand tippt — und das Getippte wäre weg.
  if (!prefs.firebaseConfig) await loadAmbientConfig();

  await useBackend(new LocalBackend());
  if (cloudProblem) setSync({ error: cloudProblem });
}

// -------------------------------------------------------------------- Aktionen

/**
 * Neue Kasse anlegen. `peopleNames` steht in der Reihenfolge, in der die Namen
 * eingetippt wurden; `myIndex` sagt, welcher davon an diesem Gerät sitzt.
 *
 * Name und Passwort sind zusammen der Schlüssel zur Kasse: aus ihnen rechnet
 * `join.js` die Kennung des Dokuments und den Nachweis aus, mit dem die anderen
 * später hereinkommen. Steht eine Firebase-Konfiguration bereit, landet die
 * Kasse deshalb gleich in der Cloud — sonst bleibt sie auf diesem Gerät, und
 * die beiden Angaben warten dort, bis jemand die Verbindung einrichtet.
 */
export async function createTrip({ name, startDate, endDate, currency, budgetMode, peopleNames, myIndex = 0, password = '', firebaseConfig = null }) {
  const people = [];
  for (const [i, n] of peopleNames.slice(0, MAX_PEOPLE).entries()) people.push(makePerson(n, i, people));
  const joinName = String(name || '').trim() || 'Unser Urlaub';
  const trip = makeTrip({ name, joinName, startDate, endDate, currency, budgetMode, people });
  const me = people[myIndex] || people[0];

  const nameProblem = checkJoinName(joinName);
  if (nameProblem) throw new Error(nameProblem);
  const passwordProblem = checkNewPassword(password);
  if (passwordProblem) throw new Error(passwordProblem);

  const config = firebaseConfig || cloudConfig();
  let warning = null;
  if (config) {
    const problem = validateFirebaseConfig(config);
    if (problem) throw new Error(problem);
    const cloud = await openCloudTrip(config, joinName, password);
    try {
      // Die eigene Kasse desselben Namens würde ein zweites Anlegen still
      // überschreiben — der Server sieht darin ja eine erlaubte Änderung.
      // Der erste Zugriff meldet auch gleich das Gerät an; ohne Empfang wartet
      // er sonst ewig, und der Knopf bliebe für immer gesperrt.
      if (await withTimeout(cloud.isMine(), 12000, NO_CONNECTION)) {
        throw new Error('Unter diesem Namen führst du schon eine Kasse. Wähle einen anderen Namen.');
      }
      // Hier steht die Anmeldung schon: eine langsame Leitung heißt jetzt nur,
      // dass der Schreibvorgang in der Warteschlange liegt und später rausgeht.
      await withTimeout(cloud.createTrip(trip, { personId: me.id }), 15000, NO_CONNECTION).catch((err) => {
        if (err?.message !== NO_CONNECTION) throw err;
      });
      setPrefs({
        firebaseConfig: config,
        tripRef: { mode: 'cloud', tripId: cloud.tripId, inviteCode: cloud.inviteCode, joinName, joinPassword: password },
        myPersonId: me.id,
      });
      set({ myPersonId: me.id });
      await useBackend(cloud);
      return { mode: 'cloud', warning: null };
    } catch (err) {
      await afterFailedAttempt(cloud);
      // Am Firebase-Projekt darf der erste Start nicht scheitern: wer gerade
      // keinen Empfang hat, bekommt die Kasse auf diesem Gerät und teilt sie
      // später. Ein vergebener Name ist etwas anderes — den muss man ändern,
      // also kommt der Fehler durch.
      if (err?.message !== NO_CONNECTION) throw err;
      warning = 'Ohne Verbindung angelegt: die Kasse läuft vorerst nur auf diesem Gerät. Teilen geht später unter „Mehr“.';
    }
  }

  // Ohne Cloud bleiben Name und Passwort trotzdem stehen: wer später verbindet,
  // muss sich nichts neu ausdenken.
  setPrefs({ tripRef: { mode: 'local', joinName, joinPassword: password }, myPersonId: me.id });
  set({ myPersonId: me.id });
  const local = new LocalBackend();
  await local.createTrip(trip);
  await useBackend(local);
  return { mode: 'local', warning };
}

/** Ein Cloud-Backend für die Kasse mit diesem Namen und Passwort. */
async function openCloudTrip(config, joinName, password) {
  const { tripId, proof } = await joinKeysFor(joinName, password);
  return makeCloudBackend({ config, tripId, inviteCode: proof });
}

/**
 * Aufräumen, wenn ein Verbindungsversuch schiefgegangen ist.
 *
 * Alle Cloud-Backends teilen sich dieselbe Firebase-App; der Versuch hat die
 * bestehende beim Verbinden abgeräumt. Läuft gerade eine geteilte Kasse, wäre
 * sie danach stumm — sie zeigte weiter den letzten Stand, ohne noch etwas zu
 * hören. Deshalb fährt sie hier wieder hoch.
 */
async function afterFailedAttempt(attempt) {
  await attempt.stop().catch(() => {});
  if (backend?.mode === 'cloud') await useBackend(backend).catch(() => {});
}

/**
 * Einer bestehenden Kasse beitreten — mit Name und Passwort.
 *
 * Das ist der Weg für alle, die keinen Einladungslink bekommen haben: die
 * beiden Angaben sagt man sich am Tisch, in einer Sprachnachricht oder am
 * Telefon. Die Kennung der Kasse rechnet das Gerät selbst aus.
 */
export async function joinTripByName({ name, password, config = null }) {
  const cfg = config || cloudConfig();
  const problem = validateFirebaseConfig(cfg);
  if (problem) {
    throw new Error(
      'Diesem Gerät fehlt noch die Firebase-Konfiguration der Gruppe. Öffne einen Einladungslink oder füge sie unten ein.',
    );
  }

  const cloud = await openCloudTrip(cfg, name, password);
  try {
    await withTimeout(cloud.join({ personId: getPrefs().myPersonId }, { byName: true }), 20000, NO_CONNECTION);
  } catch (err) {
    await afterFailedAttempt(cloud);
    throw err;
  }
  setPrefs({
    firebaseConfig: cfg,
    tripRef: { mode: 'cloud', tripId: cloud.tripId, inviteCode: cloud.inviteCode, joinName: String(name).trim(), joinPassword: password },
  });
  set({ invite: null, phase: 'loading' });
  await useBackend(cloud);
}

/** Einer Einladung folgen — aus einem Link mit fertiger Kennung und Nachweis. */
export async function joinTrip({ tripId, inviteCode, config, tripName = '' }) {
  const cfg = config || cloudConfig();
  const problem = validateFirebaseConfig(cfg);
  if (problem) throw new Error(problem);

  const cloud = await makeCloudBackend({ config: cfg, tripId, inviteCode });
  try {
    await withTimeout(cloud.join({ personId: getPrefs().myPersonId }), 20000, NO_CONNECTION);
  } catch (err) {
    await afterFailedAttempt(cloud);
    throw err;
  }
  // Das Passwort steht nicht im Link — den Namen kennt das Gerät danach aus dem
  // Dokument selbst.
  setPrefs({ firebaseConfig: cfg, tripRef: { mode: 'cloud', tripId, inviteCode, joinName: tripName, joinPassword: '' } });
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
  const used = personEntryCount(personId, { contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts });
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

// --------------------------------------------------------------- Bargeld

/**
 * Bargeld aus der Kasse an eine Person ausgezahlt.
 *
 * Zählt bewusst nicht als Ausgabe: das Geld ist noch da, es liegt nur nicht
 * mehr auf dem Konto, sondern in der Tasche dieser Person. Erst eine bar
 * bezahlte Ausgabe (`payer: cashPayerFor(personId)`) nimmt der Person davon
 * etwas weg.
 */
export async function addCashOut({ personId, amount, date, note }) {
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
  await backend.putCashOut(row);
  return row;
}

export async function updateCashOut(id, patch) {
  const row = state.cashOuts.find((c) => c.id === id);
  if (!row) return;
  await backend.putCashOut({ ...row, ...patch, updatedAt: Date.now() });
}

export async function deleteCashOut(id) {
  await backend.removeCashOut(id);
}

// ------------------------------------------------------------------- Sync

/**
 * Den aktuellen lokalen Trip in ein Firebase-Projekt hochladen.
 *
 * Name und Passwort entscheiden hier über die Kennung — ab jetzt kommen die
 * anderen mit genau diesen beiden Angaben herein.
 */
export async function connectCloud(firebaseConfig, { joinName, password } = {}) {
  const problem = validateFirebaseConfig(firebaseConfig);
  if (problem) throw new Error(problem);
  if (!state.trip) throw new Error('Es gibt noch keinen Trip zum Hochladen.');

  const prefs = getPrefs();
  const name = String(joinName || prefs.tripRef?.joinName || state.trip.joinName || state.trip.name || '').trim();
  const secret = String(password || prefs.tripRef?.joinPassword || '');
  const nameProblem = checkJoinName(name);
  if (nameProblem) throw new Error(nameProblem);
  const passwordProblem = checkNewPassword(secret);
  if (passwordProblem) throw new Error(passwordProblem);

  const cloud = await openCloudTrip(firebaseConfig, name, secret);
  try {
    if (await withTimeout(cloud.isMine(), 12000, NO_CONNECTION)) {
      throw new Error('Unter diesem Namen liegt in diesem Projekt schon eine Kasse. Wähle einen anderen Namen.');
    }
    await cloud.createTrip({ ...state.trip, joinName: name }, { personId: state.myPersonId });
    await cloud.importAll({ contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts });
  } catch (err) {
    await afterFailedAttempt(cloud);
    throw err;
  }

  setPrefs({
    firebaseConfig,
    tripRef: { mode: 'cloud', tripId: cloud.tripId, inviteCode: cloud.inviteCode, joinName: name, joinPassword: secret },
  });
  await useBackend(cloud);
}

/** Zurück in den lokalen Modus — mit einer Kopie des aktuellen Standes. */
export async function disconnectCloud() {
  const copy = { trip: state.trip, contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts };
  const prefs = getPrefs();
  // Sich auch wirklich austragen. Vorher hörte dieses Gerät nur auf zuzuhören
  // und stand serverseitig weiter als Mitglied da — mit vollem Zugriff, bloß
  // ohne dass jemand es noch auf dem Schirm hatte. Ohne Netz geht das nicht;
  // dann bleibt es in der Liste und lässt sich von einem anderen Gerät
  // aussperren.
  await backend?.leave?.().catch(() => {});
  // Name und Passwort bleiben stehen: wer die Kasse später wieder teilt, soll
  // sich nichts Neues ausdenken müssen.
  setPrefs({ tripRef: { mode: 'local', joinName: joinName(), joinPassword: prefs.tripRef?.joinPassword || '' } });
  const local = new LocalBackend();
  await local.replaceAll(copy);
  await useBackend(local);
}

/**
 * Neues Passwort für die Kasse.
 *
 * Der Beitrittsname bleibt, wie er ist — an ihm hängt die Kennung des
 * Dokuments. Wer schon drin ist, bleibt drin; alte Einladungslinks und das alte
 * Passwort führen danach ins Leere.
 */
export async function changeJoinPassword(password) {
  const prefs = getPrefs();
  if (prefs.tripRef?.mode !== 'cloud') throw new Error('Die Kasse liegt gar nicht in der Cloud.');
  const problem = checkNewPassword(password);
  if (problem) throw new Error(problem);

  const name = joinName();
  const proof = await joinProofFor(name, password);
  await withTimeout(Promise.resolve(backend.setInviteCode?.(proof)), 20000, NO_CONNECTION);
  setPrefs({ tripRef: { ...prefs.tripRef, inviteCode: proof, joinName: name, joinPassword: password } });
  return password;
}

/**
 * Das Passwort auf diesem Gerät vergessen — für alle, denen der Klartext im
 * `localStorage` zu weit geht (siehe `prefs.js`).
 *
 * Verbunden bleibt die Kasse trotzdem: dafür reicht der Nachweis `inviteCode`,
 * der unverändert stehen bleibt. Nur zeigen oder weitergeben kann dieses
 * Gerät die Beitrittsdaten danach nicht mehr — dafür braucht es dann ein
 * neues Passwort (`changeJoinPassword`).
 */
export function forgetJoinPassword() {
  const prefs = getPrefs();
  if (!prefs.tripRef?.joinPassword) return;
  setPrefs({ tripRef: { ...prefs.tripRef, joinPassword: '' } });
}

/** Der Name, mit dem man dieser Kasse beitritt — nicht zwingend die Überschrift. */
function joinName() {
  const prefs = getPrefs();
  return String(state.trip?.joinName || prefs.tripRef?.joinName || state.trip?.name || '').trim();
}

/**
 * Was man weitersagen muss, damit jemand dazukommt.
 *
 * Das Passwort steht nur auf den Geräten, die es gesetzt oder eingetippt
 * haben — wer über einen Link beigetreten ist, hat es nie gesehen. Dann bleibt
 * das Feld leer, und die Oberfläche sagt das auch.
 */
export function getSharingInfo() {
  const prefs = getPrefs();
  if (prefs.tripRef?.mode !== 'cloud') return null;
  // Hat ein anderes Gerät inzwischen das Passwort gewechselt, steht hier ein
  // Nachweis, den die Kasse nicht mehr kennt. Dann ist auch das Passwort
  // daneben veraltet — und weiterzusagen wäre schlimmer als nichts zu sagen.
  const liveProof = state.trip?.inviteCode || prefs.tripRef.inviteCode;
  const outdated = !!(prefs.tripRef.inviteCode && liveProof && prefs.tripRef.inviteCode !== liveProof);
  return {
    tripId: prefs.tripRef.tripId,
    inviteCode: liveProof,
    config: prefs.firebaseConfig,
    tripName: state.trip?.name || '',
    joinName: joinName(),
    joinPassword: outdated ? '' : prefs.tripRef.joinPassword || '',
    passwordOutdated: outdated,
    // Kassen aus früheren Fassungen liegen unter einer zufälligen Kennung: zu
    // ihnen führt kein Name, nur der Einladungslink. Woran man sie erkennt: im
    // Dokument steht kein Beitrittsname.
    byName: !!state.trip?.joinName,
  };
}

// ------------------------------------------------------------------ Geräte

/**
 * Welche Geräte an dieser Kasse hängen.
 *
 * Ein verlorenes Handy war bisher nicht loszuwerden: die anonyme Anmeldung
 * gilt dauerhaft, und ausgetragen hat sich ein Gerät höchstens selbst. Damit
 * jemand ein fremdes Gerät aussperren kann, muss er es erst einmal sehen —
 * darum diese Liste. Mehr als die Kennung, wer daran sitzt und wann es zuletzt
 * da war, steht nicht drin; kein Gerätemodell, kein Browser, kein Standort.
 */
export function getDevices() {
  if (state.sync.mode !== 'cloud' || !state.trip) return [];
  const rows = state.trip.members || {};
  return (state.trip.memberUids || []).map((uid) => {
    const row = rows[uid] || {};
    return {
      uid,
      personId: row.personId || null,
      person: (state.trip.people || []).find((p) => p.id === row.personId) || null,
      joinedAt: row.joinedAt || null,
      lastSeenAt: row.lastSeenAt || null,
      isMe: !!state.sync.uid && uid === state.sync.uid,
    };
  });
}

/**
 * Ein Gerät aussperren — mit neuem Passwort im selben Zug.
 *
 * Ohne den Wechsel wäre es kein Aussperren: das Gerät kennt den Nachweis noch
 * und stünde nach dem nächsten Start wieder in der Liste. Erst kommt deshalb
 * das neue Passwort (dann kann es nicht mehr beitreten), dann das Austragen
 * (dann kommt es an die laufende Kasse nicht mehr heran).
 */
export async function removeDevice(uid, newPassword) {
  if (state.sync.mode !== 'cloud') throw new Error('Die Kasse liegt gar nicht in der Cloud.');
  if (!uid) throw new Error('Welches Gerät denn?');
  if (uid === state.sync.uid) {
    throw new Error('Dieses Gerät sperrt sich nicht selbst aus — dafür gibt es „Synchronisierung beenden“.');
  }
  await changeJoinPassword(newPassword);
  await withTimeout(Promise.resolve(backend.removeMember?.(uid)), 20000, NO_CONNECTION);
}

// ------------------------------------------------------------------ Löschen

/** So lange steht ein Löschauftrag im Dokument, bevor er ausgeführt werden darf. */
export const DELETE_GRACE_HOURS = 24;
const DELETE_GRACE_MS = DELETE_GRACE_HOURS * 3600000;

/** Hängt mehr als ein Gerät dran? Dann löscht niemand mehr im Alleingang. */
export function deleteNeedsGrace() {
  return state.sync.mode === 'cloud' && (state.trip?.memberUids || []).length > 1;
}

/** Der offene Löschauftrag — oder `null`, wenn keiner läuft. */
export function deletionRequest() {
  const at = Number(state.trip?.deleteRequestedAt) || 0;
  if (!at) return null;
  const dueAt = at + DELETE_GRACE_MS;
  return {
    at,
    dueAt,
    due: Date.now() >= dueAt,
    person: (state.trip.people || []).find((p) => p.id === state.trip.deleteRequestedByPerson) || null,
  };
}

/** Löschauftrag stellen: ab jetzt sehen ihn alle Geräte, und jedes kann ihn stoppen. */
export async function requestTripDeletion() {
  if (!deleteNeedsGrace()) throw new Error('Diese Kasse lässt sich sofort löschen.');
  await withTimeout(Promise.resolve(backend.requestDelete?.({ personId: state.myPersonId })), 20000, NO_CONNECTION);
}

/** Löschauftrag zurücknehmen. */
export async function cancelTripDeletion() {
  await withTimeout(Promise.resolve(backend.cancelDelete?.()), 20000, NO_CONNECTION);
}

/**
 * Trip löschen und zurück auf Anfang.
 *
 * Vorher legt die App eine Kopie auf diesem Gerät ab (siehe `trash.js`) — ein
 * Fehlgriff kostete bisher den ganzen Urlaub. Bei mehreren Geräten geht es
 * außerdem nur nach der Bedenkzeit: die Regeln in `firestore.rules` bestehen
 * darauf, und hier steht dieselbe Bedingung noch einmal, damit die App gar
 * nicht erst anfängt, Einträge zu löschen, die der Server danach behält.
 */
export async function deleteTrip() {
  const request = deletionRequest();
  if (deleteNeedsGrace() && !request?.due) {
    throw new Error(
      request
        ? 'Die Bedenkzeit läuft noch. Bis dahin kann jedes Gerät das Löschen stoppen.'
        : 'An dieser Kasse hängen mehrere Geräte — dafür braucht es erst einen Löschauftrag.',
    );
  }

  const backupKept = keepCopy({
    trip: state.trip,
    contributions: state.contributions,
    expenses: state.expenses,
    cashOuts: state.cashOuts,
  });

  await backend.deleteTrip?.();
  clearPrefs();
  const local = new LocalBackend();
  // Auch eine ältere lokale Kopie muss weg, sonst taucht sie danach wieder auf.
  await local.deleteTrip();
  set({ trip: null, contributions: [], expenses: [], cashOuts: [], myPersonId: null, invite: null, phase: 'onboarding' });
  await useBackend(local);
  return { backupKept };
}

/** Die zuletzt gelöschte Kasse, solange sie noch zurückzuholen ist. */
export function lastDeleted() {
  return lastCopy();
}

/** Sie doch behalten: zurück auf dieses Gerät, ohne Cloud. */
export async function restoreLastDeleted() {
  const copy = lastCopy();
  if (!copy) throw new Error('Es gibt nichts mehr zurückzuholen.');
  const { parseImport } = await import('./link.js');
  const payload = parseImport(copy.json);

  const local = new LocalBackend();
  await local.replaceAll({
    trip: { ...payload.trip, updatedAt: Date.now() },
    contributions: payload.contributions,
    expenses: payload.expenses,
    cashOuts: payload.cashOuts || [],
  });
  setPrefs({
    tripRef: { mode: 'local', joinName: payload.trip.joinName || payload.trip.name || '', joinPassword: '' },
  });
  discardCopy();
  await useBackend(local);
}

/** Die Kopie endgültig wegwerfen. */
export function discardLastDeleted() {
  discardCopy();
}

// ------------------------------------------------------------------- Daten

export async function importData(payload) {
  await backend.replaceAll({
    trip: { ...payload.trip, updatedAt: Date.now() },
    contributions: payload.contributions,
    expenses: payload.expenses,
    cashOuts: payload.cashOuts || [],
  });
}

export function me() {
  return state.trip?.people?.find((p) => p.id === state.myPersonId) || null;
}
