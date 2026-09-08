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
import { todayISO, POT, MAX_PEOPLE, nextPersonColor, personEntryCount, averageShare, packQty, planExpenseCategory } from './calc.js';

let backend = null;
const listeners = new Set();

let state = {
  phase: 'loading', // loading | onboarding | ready
  trip: null,
  contributions: [],
  expenses: [],
  cashOuts: [],
  planItems: [],
  packItems: [],
  myPersonId: null,
  invite: null, // offene Einladung aus dem Link
  // Die zuletzt gelöschte Kasse, solange sie noch zurückzuholen ist — siehe
  // `handleChange`. Nur relevant, solange kein Trip offen ist; dort lohnt
  // sich das Nachsehen in `trash.js` nicht bei jeder Änderung.
  lastDeletedSummary: null,
  // Der Kontozustand aus `auth.js` — solange niemand ihn gebraucht hat, steht
  // hier 'unknown', und Firebase ist ungeladen. 'localOnly' ist der Zustand
  // nach „Nur auf diesem Gerät“: bewusst kein Konto, keine Frage mehr offen.
  account: { status: 'unknown', uid: null, email: '', displayName: '', emailVerified: false },
  // Die Übersicht aller Kassen dieses Kontos — nur gefüllt, solange sie
  // gebraucht wird (siehe `loadMyTrips`).
  myTrips: [],
  tripsLoading: false,
  // Wurde für dieses Konto schon einmal geladen? Ohne dieses Flag lässt sich
  // „noch nicht geladen“ nicht von „geladen, aber keine Kasse gefunden“
  // unterscheiden — und genau das führte dazu, dass ein Konto ganz ohne
  // gemeinsame Kasse für immer im Ladekreis hing (siehe `renderTrips`).
  tripsLoaded: false,
  showTripList: false,
  // Ausdrücklich aufgerufene Anmeldemaske (Einstellungen → Konto), auch wenn
  // schon eine Kasse offen ist.
  accountScreen: false,
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

/**
 * Nur für Tests: den Zustand direkt setzen, ohne den Weg über Backend oder
 * Konto zu nehmen — für Übergänge wie „Konto gerade angemeldet, lokales
 * Backend noch im leeren Anfangszustand“, die sich sonst nur mit einem
 * echten Firebase-Projekt nachstellen ließen.
 */
export function _setStateForTests(patch) {
  state = { ...state, ...patch };
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

async function handleChange(data) {
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
    // Nur nachsehen, solange es keinen Trip gibt — genau dort, wo der
    // Anfangsbildschirm die Karte zum Zurückholen zeigen könnte. Bei jeder
    // Änderung an einer laufenden Kasse wäre das Nachsehen in `trash.js`
    // reine Verschwendung.
    lastDeletedSummary: trip ? null : await lastCopy(),
    contributions: sortByDate(data.contributions),
    expenses: sortByDate(data.expenses),
    cashOuts: sortByDate(data.cashOuts || []),
    // Nicht mit `sortByDate`: der Reiseplan sortiert Tage aufsteigend und
    // innerhalb eines Tages nach Uhrzeit (siehe `planItemsByDay`), nicht nach
    // „neueste zuerst“ wie die übrigen Listen.
    planItems: data.planItems || [],
    // Die Packliste sortiert sich nach Kategorie und Eingabereihenfolge, nicht
    // nach Datum — sie hat gar keins (siehe `packItemsByCategory`).
    packItems: data.packItems || [],
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
 * Gehört jetzt die Anmeldemaske auf den Schirm?
 *
 * Vier Bedingungen, und jede davon ist eine bewusste Zurückhaltung:
 *
 *   - Ohne Firebase-Konfiguration gibt es gar keine Konten — dann wäre die
 *     Maske eine Frage ohne mögliche Antwort.
 *   - Wer schon eine Kasse führt, wird nicht ausgesperrt. Bestehende Geräte
 *     laufen weiter wie bisher; das Konto holen sie sich über die
 *     Einstellungen, wenn sie es brauchen.
 *   - Eine offene Einladung hat Vorrang: sie wurde gerade angetippt.
 *   - Und wer sich schon entschieden hat ('local' oder angemeldet), wird
 *     nicht noch einmal gefragt.
 */
export function needsAccountScreen() {
  const { account, trip, invite } = state;
  if (!cloudReady()) return false;
  // Ausdrücklich aufgerufen (Einstellungen → Konto): dann auch mit offener
  // Kasse, und mit einem Rückweg dorthin.
  if (state.accountScreen) return account.status !== 'ready';
  if (trip || invite) return false;
  if (getPrefs().accountChoice === 'local') return false;
  return account.status === 'unknown'
      || account.status === 'signedOut'
      || account.status === 'anonymous'
      || account.status === 'unverified';
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

  // Eine gespeicherte Anmeldung zurückholen — aber nur dort, wo sich schon
  // jemand angemeldet hat. Bei 'local' und bei „noch nicht gefragt“ bleibt
  // Firebase ungeladen: die Anmeldemaske selbst braucht es nicht, erst der
  // Griff zu „Anmelden“ oder „Konto erstellen“ tut es.
  if (getPrefs().accountChoice === 'account' && cloudConfig()) {
    await startAccount().catch((err) => setSync({ error: err?.message || String(err) }));
  }

  await useBackend(new LocalBackend());
  if (cloudProblem) setSync({ error: cloudProblem });
}

// ---------------------------------------------------------------------- Konto

/**
 * Das Kontomodul, erst bei Bedarf geladen — wie das Firestore-Backend. Wer
 * „Nur auf diesem Gerät“ gewählt hat, kommt hier nie vorbei, und damit bleibt
 * es dabei, dass der lokale Modus kein einziges Byte Firebase lädt.
 */
let auth = null;

async function loadAuth() {
  if (!auth) auth = await import('./auth.js');
  return auth;
}

/** Verbindet das Kontomodul und meldet jede Änderung in den Zustand. */
async function startAccount() {
  const config = cloudConfig();
  if (!config) throw new Error('Diesem Gerät fehlt noch die Firebase-Konfiguration der Gruppe.');
  const mod = await loadAuth();
  mod.subscribe((account) => set({ account }));
  await mod.start(config);
  return getState().account;
}

/**
 * „Nur auf diesem Gerät“ — die dritte Antwort auf der Anmeldemaske, und eine
 * vollwertige: ohne Konto bleibt alles im Speicher dieses Browsers. Die Wahl
 * wird gemerkt, damit die Maske nicht bei jedem Start wieder dasteht; über
 * die Einstellungen lässt sie sich später umstimmen.
 */
export async function chooseLocalOnly() {
  setPrefs({ accountChoice: 'local' });
  set({ account: { ...getState().account, status: 'localOnly' } });
}

export async function signUp({ email, password, displayName }) {
  const mod = await loadAuth();
  await startAccount();
  const account = await mod.signUp({ email, password, displayName });
  setPrefs({ accountChoice: 'account' });
  set({ account, myTrips: [], tripsLoaded: false });
  return account;
}

export async function signIn({ email, password }) {
  const mod = await loadAuth();
  await startAccount();
  const account = await mod.signIn({ email, password });
  setPrefs({ accountChoice: 'account' });
  // Angemeldet — falls die Maske aus den Einstellungen kam, ist ihre Frage
  // damit beantwortet und der Weg zurück zur Kasse frei. Und die Übersicht
  // gehört diesem Konto neu geladen, nicht dem, das davor angemeldet war.
  set({ account, accountScreen: false, myTrips: [], tripsLoaded: false });
  return account;
}

export async function signOutAccount() {
  const mod = await loadAuth();
  await mod.signOutAccount();
  // Die Wahl fällt zurück auf „noch nicht gefragt“: nach dem Abmelden steht
  // wieder dieselbe Auswahl da wie beim ersten Start.
  setPrefs({ accountChoice: null });
  set({ account: mod.getAuthState(), myTrips: [], tripsLoaded: false });
}

export async function resendVerification() {
  return (await loadAuth()).resendVerification();
}

export async function changeDisplayName(name) {
  const mod = await loadAuth();
  await mod.changeDisplayName(name);
  set({ account: mod.getAuthState() });
}

/**
 * Die Anmeldemaske aufrufen, obwohl schon eine Kasse offen ist — der Weg aus
 * den Einstellungen heraus für alle, die bisher ohne Konto unterwegs sind.
 *
 * Bewusst über ein eigenes Kennzeichen und nicht dadurch, dass die offene
 * Kasse aus dem Zustand fällt: sie soll dastehen bleiben, und der Rückweg
 * („Zurück zur Kasse“) soll nichts wiederherstellen müssen.
 */
export function showAccountScreen() {
  set({ accountScreen: true, showTripList: false });
}

/** Die Maske wieder schließen, ohne etwas entschieden zu haben. */
export function hideAccountScreen() {
  set({ accountScreen: false });
}

export async function refreshVerification() {
  const account = await (await loadAuth()).refreshVerification();
  set({ account, accountScreen: account?.status === 'ready' ? false : state.accountScreen });
  return account;
}

export async function resetPassword(email) {
  const mod = await loadAuth();
  await startAccount();
  return mod.resetPassword(email);
}

// ------------------------------------------------------------- Meine Kassen

/**
 * Die Übersicht aller Kassen dieses Kontos.
 *
 * Der Store bleibt dabei, was er war: er hält *eine* offene Kasse. Die
 * Übersicht ist keine zweite Welt, sondern ein Umschalter davor — die ganze
 * App darunter (Budget, Ausgaben, Abrechnung) rechnet weiter mit genau einer.
 * `tripRef.tripId` war schon immer der Zeiger darauf; neu ist nur, dass ihn
 * jemand anderes als der Zufall des ersten Starts setzen kann.
 */
export async function loadMyTrips() {
  const config = cloudConfig();
  const uid = state.account?.uid;
  if (!config || !uid) return [];
  set({ tripsLoading: true });
  try {
    const { listTripsForUid } = await import('./backend-firestore.js');
    const trips = await withTimeout(listTripsForUid(config, uid), 15000, NO_CONNECTION);
    // Der nächste Urlaub zuerst, Vergangenes hinten — wonach man sucht, steht
    // oben.
    trips.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    set({ myTrips: trips, tripsLoading: false, tripsLoaded: true });
    return trips;
  } catch (err) {
    set({ tripsLoading: false, tripsLoaded: true });
    throw err;
  }
}

/** Eine Kasse aus der Übersicht öffnen. */
export async function openTrip({ tripId, inviteCode, joinName = '' }) {
  const config = cloudConfig();
  if (!config) throw new Error('Diesem Gerät fehlt die Firebase-Konfiguration der Gruppe.');
  set({ phase: 'loading', showTripList: false });
  const cloud = await makeCloudBackend({ config, tripId, inviteCode });
  try {
    await useBackend(cloud);
  } catch (err) {
    await afterFailedAttempt(cloud);
    set({ showTripList: true });
    throw err;
  }
  // Das Passwort steht hier bewusst nicht: wer schon Mitglied ist, kommt über
  // `inviteCode` aus dem Dokument herein und braucht es nicht. Was in `prefs`
  // an Passwort steht, gehört zu der Kasse, die dort vorher stand — es hier
  // stehen zu lassen, hieße es der falschen zuzuordnen.
  setPrefs({ tripRef: { mode: 'cloud', tripId, inviteCode, joinName, joinPassword: '' } });
}

/** Zurück zur Übersicht, ohne die offene Kasse anzurühren. */
export function showTrips() {
  set({ showTripList: true });
}

/** Von der Übersicht zum Anlegen einer neuen Kasse. */
export function startNewTrip() {
  set({ showTripList: false, phase: 'onboarding' });
}

/**
 * Konto löschen — mit allem, was daran hängt (Art. 17 DSGVO).
 *
 * Die Reihenfolge ist der ganze Punkt: erst austragen, dann löschen. Nach dem
 * Löschen des Kontos gibt es niemanden mehr, der sich aus einer Kasse
 * austragen dürfte — die Kennung stünde für immer in `memberUids`, und in
 * einer Kasse mit acht Plätzen wäre einer davon dauerhaft von einem Konto
 * belegt, das es nicht mehr gibt.
 *
 * Wo dieses Konto das letzte Mitglied war, geht die Kasse mit: sonst bliebe
 * ein Dokument liegen, das niemand mehr öffnen kann und das trotzdem Namen
 * und Beträge enthält. Gelöscht soll gelöscht heißen.
 *
 * Was das *nicht* leistet: Kassen, in denen noch andere sind, bleiben stehen —
 * sie gehören auch den anderen. Dort verschwindet nur die eigene Kennung; die
 * bereits eingetragenen Ausgaben bleiben als Teil der gemeinsamen Abrechnung
 * bestehen, sonst ginge die Rechnung der Gruppe nicht mehr auf.
 */
export async function deleteAccountEverywhere(password) {
  const mod = await loadAuth();
  const config = cloudConfig();
  const uid = state.account?.uid;
  if (!uid) throw new Error('Dafür musst du angemeldet sein.');

  const failed = [];
  if (config) {
    const trips = await loadMyTrips().catch(() => []);
    for (const trip of trips) {
      try {
        const cloud = await makeCloudBackend({ config, tripId: trip.tripId, inviteCode: trip.inviteCode });
        await cloud._connect();
        if (trip.memberCount <= 1) await cloud.deleteTrip();
        else await cloud.leave();
        await cloud.stop().catch(() => {});
      } catch {
        failed.push(trip.name);
      }
    }
  }
  // Erst wenn das Austragen durch ist — und nur dann. Bleibt eine Kasse
  // hängen, wäre das Konto danach weg und die Kennung nicht mehr zu
  // entfernen; lieber ehrlich abbrechen und es noch einmal versuchen lassen.
  if (failed.length) {
    throw new Error(`Aus diesen Kassen konntest du nicht ausgetragen werden: ${failed.join(', ')}. Das Konto bleibt bestehen — versuch es noch einmal, wenn wieder Empfang da ist.`);
  }

  await mod.deleteAccount(password);
  setPrefs({ accountChoice: null, tripRef: null, myPersonId: null });
  set({ account: mod.getAuthState(), myTrips: [], tripsLoaded: false, showTripList: false });
  await useBackend(new LocalBackend());
}

/**
 * Gehört die Übersicht auf den Schirm? Immer dann, wenn jemand angemeldet ist
 * und gerade keine Kasse offen hat — und immer dann, wenn jemand sie
 * ausdrücklich aufgerufen hat.
 */
export function needsTripList() {
  if (state.account?.status !== 'ready') return false;
  if (state.invite) return false; // eine angetippte Einladung geht vor
  // `state.phase` beschreibt nur die Buchhaltung des lokalen Backends — bei
  // einem frischen Gerät ohne lokale Kasse steht dort 'onboarding', auch
  // direkt nach einer erfolgreichen Anmeldung. Das hier fragt etwas anderes:
  // ist gerade *keine* Kasse offen? Dann gehört die Übersicht auf den Schirm,
  // nicht der „Kasse anlegen“-Bildschirm — sonst müsste sich jemand, der sich
  // gerade zum ersten Mal auf einem neuen Gerät angemeldet hat, Name und
  // Passwort seiner Kasse erst wieder heraussuchen, obwohl die Liste bereithält.
  return state.showTripList || !state.trip;
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

  // Ohne Konto bleibt eine neue Kasse auf diesem Gerät — auch dann, wenn eine
  // Firebase-Konfiguration bereitläge. Vorher ging jede neue Kasse in die
  // Cloud, sobald es eine Konfiguration gab; mit der Wahl „Nur auf diesem
  // Gerät“ wäre das eine Übergehung genau dieser Wahl.
  const config = (firebaseConfig || cloudConfig()) && canCreateInCloud() ? (firebaseConfig || cloudConfig()) : null;
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

/**
 * Der Türsteher vor allem, was in der Cloud *neu* entsteht: eine Kasse
 * anlegen oder einer beitreten.
 *
 * Warum das hier steht und nicht erst der Server antwortet: der Server sagt
 * bei einer abgelehnten Anfrage nur „kein Zugriff“ und nie, warum — er
 * verrät ja bewusst nichts über fremde Kassen. `createTrip` deutet dieses
 * „kein Zugriff“ deshalb als „Name schon vergeben“, und `join` als „Name oder
 * Passwort stimmt nicht“. Beides wäre hier grundfalsch: es liegt weder am
 * Namen noch am Passwort, sondern am fehlenden Konto. Also fragen wir vorher.
 *
 * Bestehende Kassen rührt das nicht an — dort hängt der Zugriff weiter an der
 * Mitgliedschaft, nicht am Konto (siehe `firestore.rules`).
 */
function ensureAccountForNewCloudTrip() {
  const status = state.account?.status;
  if (status === 'ready') return;
  if (status === 'unverified') {
    throw new Error('Bestätige zuerst deine E-Mail-Adresse — den Link haben wir dir geschickt. Danach geht das hier.');
  }
  throw new Error('Dafür braucht es ein Konto: eine geteilte Kasse hängt an einer Person, nicht an diesem Browser. Unter „Mehr → Konto“ ist es in einer Minute angelegt.');
}

/**
 * Darf eine *neue* Kasse gleich in die Cloud, oder bleibt sie auf dem Gerät?
 *
 * Beim Beitreten ist ein fehlendes Konto ein Fehler — eine geteilte Kasse
 * lässt sich nun einmal nicht lokal betreten. Beim Anlegen wäre derselbe
 * Fehler falsch: wer „Nur auf diesem Gerät“ gewählt hat, will genau das, und
 * eine Absage wäre die Antwort auf eine Frage, die niemand gestellt hat. Also
 * legt die App sie dort an, wo sie hingehört, und sagt es dazu.
 */
function canCreateInCloud() {
  return state.account?.status === 'ready';
}

/** Ein Cloud-Backend für die Kasse mit diesem Namen und Passwort. */
async function openCloudTrip(config, joinName, password) {
  const { tripId, proof } = await joinKeysFor(joinName, password);
  return makeCloudBackend({ config, tripId, inviteCode: proof });
}

/**
 * Aufräumen, wenn ein Verbindungsversuch schiefgegangen ist.
 *
 * Der gescheiterte Versuch hat seine Zuhörer registriert und muss sie wieder
 * loswerden, sonst spricht ein Backend weiter, das niemand mehr benutzt. Die
 * Firebase-App selbst bleibt davon unberührt — sie gehört seit `firebase-app.js`
 * dem Gerät, nicht dem einzelnen Verbindungsversuch. Läuft daneben eine
 * geteilte Kasse, fährt sie hier trotzdem wieder hoch: ihre Zuhörer hingen an
 * demselben `stop()`-Zyklus.
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
  ensureAccountForNewCloudTrip();

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
 * verfälschen, ohne dass es jemandem auffällt. Genauso wenig, solange sie
 * noch eine private Packliste hat — die gehörte danach niemandem mehr. Wer
 * schon eingetragen ist, bleibt deshalb drin — Namen ändern geht weiterhin.
 */
export async function removePerson(personId) {
  const people = state.trip?.people || [];
  const person = people.find((p) => p.id === personId);
  if (!person) return;
  if (people.length <= 1) throw new Error('Eine Person muss bleiben.');
  const used = personEntryCount(personId, { contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts, planItems: state.planItems, packItems: state.packItems });
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

// ---------------------------------------------------------------- Reiseplan

/**
 * Ein Programmpunkt ist kein Geld-Objekt — er beantwortet „was, wann“, nicht
 * „wie viel“. Bekommt er einen Kostenpunkt, entsteht daraus sofort eine
 * vorgemerkte Ausgabe: das Budget auf „Heute“ und „Budget“ stimmt damit von
 * Anfang an, auch für einen noch nicht besuchten, aber schon teuren
 * Programmpunkt — genau wie bei jeder anderen Vormerkung.
 */
export async function addPlanItem({ date, time, endTime, title, category, sub, note, payer, amount, location }) {
  const now = Date.now();
  const row = {
    id: newId(),
    date: date || todayISO(),
    time: time || '',
    // Nur mit Start sinnvoll — ein Ende ohne Anfang wäre keine Dauer.
    endTime: time ? endTime || '' : '',
    title: String(title || '').trim(),
    category: category || 'other',
    sub: sub || '',
    location: (location || '').trim(),
    note: (note || '').trim(),
    payer: payer || POT,
    linkedExpenseId: null,
    done: false,
    createdAt: now,
    updatedAt: now,
    createdBy: state.myPersonId || null,
  };
  if (amount > 0) {
    const expense = await addExpense({ amount, date: row.date, category: planExpenseCategory(row.category), note: row.title, payer: row.payer, planned: true });
    row.linkedExpenseId = expense.id;
  }
  await backend.putPlanItem(row);
  return row;
}

/**
 * Ändert einen Programmpunkt — und zieht eine noch offene, verknüpfte
 * Vormerkung nach: neuer Betrag, neues Datum, neue Kategorie, neuer Zahler,
 * das ist ja derselbe Programmpunkt, nur mit anderen Angaben. Ist die
 * Vormerkung schon bezahlt, ist sie echte Ausgabengeschichte — dann rührt
 * dieser Aufruf sie nicht mehr an, ändern geht dann nur noch unter „Ausgaben“.
 *
 * Auf null gesetzt, geht eine noch offene Vormerkung mit weg: ohne
 * Kostenpunkt gibt es nichts mehr zu verplanen. Ein erster Kostenpunkt an
 * einem bislang kostenlosen Programmpunkt legt sie neu an.
 */
export async function updatePlanItem(id, patch) {
  const row = state.planItems.find((p) => p.id === id);
  if (!row) return;
  const next = { ...row, ...patch, updatedAt: Date.now() };
  const linked = row.linkedExpenseId ? state.expenses.find((e) => e.id === row.linkedExpenseId) : null;
  const stillOpen = !linked || linked.planned;

  if (stillOpen && patch.amount !== undefined) {
    if (patch.amount > 0 && !linked) {
      const expense = await addExpense({ amount: patch.amount, date: next.date, category: planExpenseCategory(next.category), note: next.title, payer: next.payer, planned: true });
      next.linkedExpenseId = expense.id;
    } else if (patch.amount > 0 && linked) {
      await updateExpense(linked.id, { amount: patch.amount, date: next.date, category: planExpenseCategory(next.category), note: next.title, payer: next.payer });
    } else if (!(patch.amount > 0) && linked) {
      await deleteExpense(linked.id);
      next.linkedExpenseId = null;
    }
  } else if (stillOpen && linked) {
    // Kein neuer Betrag im Patch — aber Datum, Kategorie, Titel oder Zahler
    // können sich geändert haben, und die noch offene Vormerkung soll dieselbe
    // Auskunft tragen wie der Programmpunkt selbst.
    await updateExpense(linked.id, { date: next.date, category: planExpenseCategory(next.category), note: next.title, payer: next.payer });
  }

  await backend.putPlanItem(next);
}

/**
 * Programmpunkt löschen. Eine noch offene Vormerkung gehört nur zu ihm und
 * geht mit — niemand sonst weiß von ihr. Eine schon bezahlte ist echte
 * Ausgabengeschichte und bleibt stehen.
 */
export async function deletePlanItem(id) {
  const row = state.planItems.find((p) => p.id === id);
  const linked = row?.linkedExpenseId ? state.expenses.find((e) => e.id === row.linkedExpenseId) : null;
  if (linked?.planned) await deleteExpense(linked.id);
  await backend.removePlanItem(id);
}

/** Erledigt — eine noch offene Vormerkung wird dabei zur echten Ausgabe. */
export async function markPlanItemDone(id, today = todayISO()) {
  const row = state.planItems.find((p) => p.id === id);
  if (!row) return;
  const linked = row.linkedExpenseId ? state.expenses.find((e) => e.id === row.linkedExpenseId) : null;
  if (linked?.planned) await markExpensePaid(linked.id, today);
  await backend.putPlanItem({ ...row, done: true, updatedAt: Date.now() });
}

/**
 * Zurück auf offen — auch wenn die verknüpfte Ausgabe unterdessen unter
 * „Ausgaben“ direkt bezahlt wurde (dort lässt sich jede Vormerkung abhaken,
 * nicht nur über den Reiseplan). Dann macht das Zurücknehmen beides rückgängig,
 * sonst stünde das Geld doppelt da: einmal als „schon ausgegeben“, einmal
 * wieder als Vorhaben.
 */
export async function markPlanItemOpen(id) {
  const row = state.planItems.find((p) => p.id === id);
  if (!row) return;
  const linked = row.linkedExpenseId ? state.expenses.find((e) => e.id === row.linkedExpenseId) : null;
  if (linked?.fromPlan) await updateExpense(linked.id, { planned: true, fromPlan: false });
  await backend.putPlanItem({ ...row, done: false, updatedAt: Date.now() });
}

// ------------------------------------------------------------------ Packliste

/**
 * Ein Eintrag auf der Packliste — das schlichteste Objekt dieser App: ein
 * Ding, das mitmuss. Kein Datum, kein Betrag, kein Zahler; nur was es ist,
 * wie weit es ist und in welche Tasche es gehört.
 *
 * Absichtlich anspruchslos beim Anlegen: „erst alles eintragen, dann sortieren“
 * ist die Art, wie Packlisten entstehen. Ein Titel genügt, alles Weitere hat
 * eine Voreinstellung und lässt sich später an der Zeile ändern.
 */
export async function addPackItem({ title, category, sub, status, bag, note, qty, shared } = {}) {
  const now = Date.now();
  const row = {
    id: newId(),
    title: String(title || '').trim(),
    category: category || 'other',
    // Die Sorte („T-Shirt“, „Wanderschuhe“) ist freiwillig und hat deshalb
    // keine Voreinstellung: sie zu erraten hieße, die Übersicht mit Zahlen zu
    // füllen, die niemand eingetragen hat.
    sub: sub || '',
    qty: packQty({ qty }),
    status: status || 'open',
    bag: bag || 'none',
    note: (note || '').trim(),
    // Immer ausdrücklich `true` oder `false`, nie unbestimmt — nur so bleibt
    // ein Eintrag ohne das Feld sicher als „aus der Zeit vor der Unterscheidung“
    // erkennbar (siehe `packItemShared`). Privat geht nur mit gewählter
    // Person: sonst gehörte der Eintrag niemandem und wäre auf keiner der
    // beiden Listen mehr zu finden (siehe `packItemsMine`).
    shared: shared === true || !state.myPersonId,
    createdAt: now,
    updatedAt: now,
    createdBy: state.myPersonId || null,
  };
  await backend.putPackItem(row);
  return row;
}

export async function updatePackItem(id, patch) {
  const row = state.packItems.find((p) => p.id === id);
  if (!row) return;
  const next = { ...row, ...patch };
  if (patch.shared === false) {
    if (!state.myPersonId) {
      // Dasselbe Sicherheitsnetz wie beim Anlegen: ohne gewählte Person bleibt
      // der Eintrag gemeinsam, statt für niemanden mehr auffindbar zu sein.
      next.shared = true;
    } else if (row.shared !== false) {
      // Wer einen Eintrag auf „Meine Liste“ umstellt, macht ihn zu seinem
      // eigenen. Ohne das bliebe `createdBy` an der Person hängen, die ihn
      // ursprünglich angelegt hat — der Eintrag verschwände dann für beide:
      // aus der gemeinsamen Liste, weil nicht mehr geteilt, und aus der
      // eigenen der bearbeitenden Person, weil `createdBy` weiter auf jemand
      // anderen zeigt.
      next.createdBy = state.myPersonId;
    }
  }
  await backend.putPackItem({ ...next, updatedAt: Date.now() });
}

export async function deletePackItem(id) {
  await backend.removePackItem(id);
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
    await cloud.importAll({ contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts, planItems: state.planItems, packItems: state.packItems });
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
  const copy = { trip: state.trip, contributions: state.contributions, expenses: state.expenses, cashOuts: state.cashOuts, planItems: state.planItems, packItems: state.packItems };
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

  const backupKept = await keepCopy({
    trip: state.trip,
    contributions: state.contributions,
    expenses: state.expenses,
    cashOuts: state.cashOuts,
    planItems: state.planItems,
    packItems: state.packItems,
  });

  await backend.deleteTrip?.();
  clearPrefs();
  const local = new LocalBackend();
  // Auch eine ältere lokale Kopie muss weg, sonst taucht sie danach wieder auf.
  await local.deleteTrip();
  set({
    trip: null, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [],
    myPersonId: null, invite: null, phase: 'onboarding',
    // `keepCopy` ist zu diesem Zeitpunkt schon durch — sofort mitgeben, statt
    // auf das nächste `handleChange` zu warten und die Karte zum
    // Zurückholen einen Wimpernschlag lang zu verpassen.
    lastDeletedSummary: await lastCopy(),
  });
  await useBackend(local);
  return { backupKept };
}

/** Die zuletzt gelöschte Kasse, solange sie noch zurückzuholen ist. */
export function lastDeleted() {
  return state.lastDeletedSummary;
}

/** Sie doch behalten: zurück auf dieses Gerät, ohne Cloud. */
export async function restoreLastDeleted() {
  const copy = await lastCopy();
  if (!copy) throw new Error('Es gibt nichts mehr zurückzuholen.');
  const { parseImport } = await import('./link.js');
  const payload = parseImport(copy.json);

  const local = new LocalBackend();
  await local.replaceAll({
    trip: { ...payload.trip, updatedAt: Date.now() },
    contributions: payload.contributions,
    expenses: payload.expenses,
    cashOuts: payload.cashOuts || [],
    planItems: payload.planItems || [],
    packItems: payload.packItems || [],
  });
  setPrefs({
    tripRef: { mode: 'local', joinName: payload.trip.joinName || payload.trip.name || '', joinPassword: '' },
  });
  await discardCopy();
  await useBackend(local);
}

/** Die Kopie endgültig wegwerfen. */
export async function discardLastDeleted() {
  await discardCopy();
  set({ lastDeletedSummary: null });
}

// ------------------------------------------------------------------- Daten

export async function importData(payload) {
  await backend.replaceAll({
    trip: { ...payload.trip, updatedAt: Date.now() },
    contributions: payload.contributions,
    expenses: payload.expenses,
    cashOuts: payload.cashOuts || [],
    planItems: payload.planItems || [],
    packItems: payload.packItems || [],
  });
}

export function me() {
  return state.trip?.people?.find((p) => p.id === state.myPersonId) || null;
}
