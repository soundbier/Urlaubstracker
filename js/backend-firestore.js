/**
 * Backend mit Firestore: alle Geräte der Gruppe hängen am selben Trip.
 *
 * Firestore hält die Daten selbst offline vor und schiebt Änderungen nach,
 * sobald wieder Netz da ist. Für die App heißt das: schreiben geht immer,
 * auch ohne Empfang, und `fromCache` sagt uns, ob wir gerade nur den lokalen
 * Stand sehen.
 *
 * Zugriff regelt `firestore.rules`: lesen und schreiben darf, wer in
 * `memberUids` steht. Beitreten darf, wer den Einladungscode kennt.
 *
 * Den Einladungscode kennt ein fremdes Gerät nicht — raten oder offline
 * gegen eine Wortliste vorrechnen kann es trotzdem, wenn es den Namen der
 * Kasse kennt (siehe join.js). Dagegen bremst Firestore von sich aus nichts;
 * steht `appCheckSiteKey` in der Konfiguration, meldet sich dieses Gerät
 * zusätzlich mit einem Nachweis von Firebase App Check (reCAPTCHA Enterprise) an —
 * ausgeschlossen wird darüber nicht das falsche Passwort, sondern das
 * automatisierte Durchprobieren vieler davon. Der Nachweis allein bremst
 * aber nur, wenn er in der Firebase-Konsole auch *erzwungen* wird (App Check
 * → APIs → Firestore und Authentication → „Erzwingen“) — ohne das lässt
 * Firebase Anfragen ohne gültigen Nachweis weiterhin durch. Siehe README,
 * Abschnitt „App Check“.
 *
 * Die Firebase-App, die Anmeldung und App Check gehören diesem Backend nicht:
 * die liegen in `firebase-app.js`, einmal pro Gerät und unabhängig davon,
 * welche Kasse offen ist. Hier steht nur, was mit *dieser* Kasse zu tun hat.
 */
import * as fb from '../vendor/firebase.js';
import { connectFirebase, currentUser } from './firebase-app.js';

/** Felder des Trips, die der App gehören — Sync-Felder rühren wir nicht an. */
// `dataRegion` gehört dazu: wo die Kasse liegt, muss jedes Gerät sehen können —
// sonst weiß nur dasjenige Bescheid, das sie eingerichtet hat (siehe privacy.js).
const TRIP_FIELDS = ['name', 'joinName', 'startDate', 'endDate', 'currency', 'budgetMode', 'people', 'dataRegion', 'updatedAt'];

function pickTripFields(trip) {
  const out = {};
  for (const k of TRIP_FIELDS) if (trip[k] !== undefined) out[k] = trip[k];
  return out;
}

/**
 * Alle Kassen, in denen dieses Konto Mitglied ist — für die Übersicht nach dem
 * Anmelden.
 *
 * Die Abfrage *muss* nach `memberUids` filtern: die Sicherheitsregeln halten
 * jedes einzelne Dokument gegen `isMember()`, und eine Abfrage, die auch nur
 * eine fremde Kasse zurückgäbe, scheitert deshalb vollständig. Das ist keine
 * Höflichkeit gegenüber dem Server, sondern die Bedingung dafür, dass hier
 * überhaupt etwas ankommt.
 *
 * Zurück kommt nur, was die Liste zeigt — und `inviteCode`, weil sich damit
 * eine Kasse öffnen lässt, ohne noch einmal nach dem Passwort zu fragen: wer
 * schon Mitglied ist, darf den Code lesen, und mehr braucht das Verbinden
 * nicht.
 */
export async function listTripsForUid(config, uid) {
  const { db, ready } = connectFirebase(config);
  await ready;
  const snap = await fb.getDocs(
    fb.query(fb.collection(db, 'trips'), fb.where('memberUids', 'array-contains', uid)),
  );
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      tripId: d.id,
      name: data.name || 'Urlaubskasse',
      joinName: data.joinName || data.name || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      currency: data.currency || 'EUR',
      inviteCode: data.inviteCode || null,
      memberCount: Array.isArray(data.memberUids) ? data.memberUids.length : 0,
      people: Array.isArray(data.people) ? data.people : [],
      // Ein laufender Löschauftrag gehört in die Übersicht: er ist der eine
      // Zustand, in dem Nichtstun etwas kostet.
      deleteRequestedAt: data.deleteRequestedAt?.toMillis?.() || null,
    };
  });
}

/**
 * Der Löschauftrag kommt als Firestore-`Timestamp` herein; im Rest der App
 * sind Zeitpunkte Millisekunden. Umgerechnet wird hier, einmal, beim Lesen —
 * geschrieben wird er nie von hier aus (siehe `requestDelete`), sondern immer
 * als Serverzeit.
 */
function normalizeTrip(trip) {
  const at = trip.deleteRequestedAt;
  if (at && typeof at.toMillis === 'function') return { ...trip, deleteRequestedAt: at.toMillis() };
  return trip;
}

/**
 * Der Name bestimmt die Kennung des Dokuments (siehe `join.js`) — steht dort
 * schon eine fremde Kasse, weist der Server das Anlegen ab. Dieselbe Antwort
 * käme, wenn die Sicherheitsregeln nie veröffentlicht wurden; deshalb steht
 * beides in der Meldung.
 */
export const NAME_TAKEN =
  'Unter diesem Namen gibt es schon eine Kasse. Wähle einen anderen Namen — oder tritt der bestehenden mit ihrem Passwort bei. (Ist das Firebase-Projekt frisch: sind die Regeln aus firestore.rules veröffentlicht?)';

/** Firestore-Fehler in etwas übersetzen, das man einer Person zeigen kann. */
export function describeError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) {
    return 'Kein Zugriff auf diese Kasse. Wurde dieses Gerät ausgesperrt oder das Passwort gewechselt, kommt es mit den neuen Beitrittsdaten wieder herein. (Ist das Firebase-Projekt frisch: sind die Regeln aus firestore.rules veröffentlicht?)';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Keine Verbindung. Deine Eingaben werden gespeichert und später übertragen.';
  }
  if (code.includes('auth/configuration-not-found') || code.includes('auth/operation-not-allowed')) {
    return 'Anonyme Anmeldung ist im Firebase-Projekt noch nicht aktiviert (Authentication → Sign-in method → Anonymous).';
  }
  if (code.includes('auth/api-key-not-valid') || code.includes('invalid-api-key')) {
    return 'Der API-Schlüssel in der Firebase-Konfiguration stimmt nicht.';
  }
  if (code.includes('failed-precondition')) {
    return 'Firestore ist im Projekt noch nicht angelegt (Firebase-Konsole → Firestore Database → Datenbank erstellen).';
  }
  return err?.message || 'Unbekannter Fehler beim Synchronisieren.';
}

export class FirestoreBackend {
  constructor({ config, tripId, inviteCode }) {
    this.mode = 'cloud';
    this.config = config;
    this.tripId = tripId;
    this.inviteCode = inviteCode || null;

    this.db = null;
    this.uid = null;

    this.data = { trip: null, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [] };
    this.onChange = null;
    this.onStatus = null;
    this._unsubs = [];
    this._touched = false;
    this._status = { mode: 'cloud', connected: false, ready: false, fromCache: true, pending: 0, error: null };
  }

  // ---------------------------------------------------------------- Verbindung

  /**
   * Verbinden und wissen, wer man ist.
   *
   * Die Firebase-App selbst gehört diesem Backend nicht mehr, sondern
   * `firebase-app.js` — genau einmal pro Seitenaufruf, unabhängig davon,
   * welche Kasse gerade offen ist. Vorher legte jeder Verbindungsaufbau sie
   * neu an und löschte die alte; eine Anmeldung, die das überleben soll (ein
   * Konto), konnte darin nicht wohnen.
   *
   * Angemeldet wird, wer schon da ist: eine wiedergekommene Konto-Sitzung
   * oder eine anonyme Anmeldung. Anonym bleibt der Weg für alles, was ohne
   * Konto geht — und für Geräte aus der Zeit davor, deren Kassen an genau
   * dieser Kennung hängen.
   */
  async _connect() {
    const { db, auth, ready } = connectFirebase(this.config);
    await ready;
    this.db = db;

    const existing = await currentUser(auth);
    this.uid = existing ? existing.uid : (await fb.signInAnonymously(auth)).user.uid;

    this._setStatus({ uid: this.uid });
    return this.uid;
  }

  _setStatus(patch) {
    this._status = { ...this._status, ...patch };
    this.onStatus?.({ ...this._status });
  }

  _emit() {
    this.onChange?.({
      trip: this.data.trip,
      contributions: [...this.data.contributions],
      expenses: [...this.data.expenses],
      cashOuts: [...this.data.cashOuts],
      planItems: [...this.data.planItems],
      packItems: [...this.data.packItems],
    });
  }

  async start(onChange, onStatus) {
    this.onChange = onChange;
    this.onStatus = onStatus;
    this._setStatus({ ready: false, error: null });
    try {
      await this._connect();
      this._listen();
    } catch (err) {
      this._setStatus({ ready: true, connected: false, error: describeError(err) });
      this._emit();
    }
  }

  _listen() {
    const tripRef = fb.doc(this.db, 'trips', this.tripId);
    const opts = { includeMetadataChanges: true };

    // Noch nicht übertragene Einträge je Sammlung — zusammengezählt ergibt das
    // die Zahl, die den Leuten offline angezeigt wird.
    const openWrites = { expenses: 0, contributions: 0, cashOuts: 0, planItems: 0, packItems: 0 };

    const collectionListener = (name, key) =>
      fb.onSnapshot(
        fb.collection(this.db, 'trips', this.tripId, name),
        opts,
        (snap) => {
          this.data[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          openWrites[key] = snap.docs.filter((d) => d.metadata.hasPendingWrites).length;
          this._setStatus({
            ready: true,
            connected: !snap.metadata.fromCache,
            fromCache: snap.metadata.fromCache,
            pending: Object.values(openWrites).reduce((a, n) => a + n, 0),
            error: null,
          });
          this._emit();
        },
        (err) => this._setStatus({ ready: true, error: describeError(err) }),
      );

    this._unsubs.push(
      fb.onSnapshot(
        tripRef,
        opts,
        (snap) => {
          // `estimate`: ein gerade abgeschickter Löschauftrag hat serverseitig
          // noch keine Zeit. Ohne die Schätzung stünde er hier als `null` da —
          // und die Warnung erschiene erst, wenn wieder Netz da ist.
          this.data.trip = snap.exists() ? normalizeTrip({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) }) : null;
          if (this.data.trip?.inviteCode) this.inviteCode = this.data.trip.inviteCode;
          this._touchPresence();
          this._setStatus({
            ready: true,
            connected: !snap.metadata.fromCache,
            fromCache: snap.metadata.fromCache,
            missing: !snap.exists() && !snap.metadata.fromCache,
            error: null,
          });
          this._emit();
        },
        (err) => this._setStatus({ ready: true, error: describeError(err) }),
      ),
      collectionListener('expenses', 'expenses'),
      collectionListener('contributions', 'contributions'),
      collectionListener('cashouts', 'cashOuts'),
      collectionListener('planitems', 'planItems'),
      collectionListener('packitems', 'packItems'),
    );
  }

  async stop() {
    for (const off of this._unsubs) {
      try {
        off();
      } catch {
        /* egal */
      }
    }
    this._unsubs = [];
    this.onChange = null;
    this.onStatus = null;
    // Die Firebase-App bleibt stehen: sie gehört nicht dieser Kasse, sondern
    // dem Gerät (siehe `firebase-app.js`). Sie hier abzuräumen hieße, die
    // Anmeldung mit abzuräumen — und beim Wechsel von einer Kasse zur
    // nächsten wäre man jedes Mal abgemeldet.
  }

  // ------------------------------------------------------------------ Schreiben

  _ref(name, id) {
    return fb.doc(this.db, 'trips', this.tripId, name, id);
  }

  /**
   * Liegt unter dieser Kennung schon eine Kasse, die diesem Gerät gehört?
   *
   * Lesen darf nur, wer Mitglied ist. Eine fremde Kasse und gar keine Kasse
   * antworten deshalb gleich („kein Zugriff“) und sind hier beide `false` —
   * die trennt erst der Schreibversuch. Was diese Prüfung verhindert, ist der
   * eine Fall, den er nicht abfängt: die eigene Kasse desselben Namens, die
   * ein zweites Anlegen kommentarlos überschreiben würde.
   */
  async isMine() {
    if (!this.db) await this._connect();
    try {
      return (await fb.getDoc(fb.doc(this.db, 'trips', this.tripId))).exists();
    } catch {
      return false;
    }
  }

  async createTrip(trip, me) {
    if (!this.db) await this._connect();
    try {
      await fb.setDoc(fb.doc(this.db, 'trips', this.tripId), {
        ...pickTripFields(trip),
        createdAt: trip.createdAt || Date.now(),
        inviteCode: this.inviteCode,
        memberUids: [this.uid],
        members: { [this.uid]: { personId: me?.personId || null, joinedAt: Date.now() } },
      });
    } catch (err) {
      if (String(err?.code || '').includes('permission-denied')) {
        // Auf der Kennung liegt schon ein Dokument, das uns nicht gehört: die
        // Kennung kommt aus dem Namen, also ist der Name vergeben.
        throw new Error(NAME_TAKEN);
      }
      throw err;
    }
  }

  /**
   * Einem bestehenden Trip beitreten. Die Regeln prüfen `joinProof` gegen den
   * Einladungscode im Dokument — den kann das Gerät vorher nicht lesen, deshalb
   * schicken wir ihn mit und lassen den Server vergleichen.
   */
  async join(me, { byName = false } = {}) {
    if (!this.db) await this._connect();
    try {
      await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
        memberUids: fb.arrayUnion(this.uid),
        joinProof: this.inviteCode,
        [`members.${this.uid}`]: { personId: me?.personId || null, joinedAt: Date.now() },
      });
    } catch (err) {
      const code = String(err?.code || '');
      if (code.includes('not-found')) {
        throw new Error(byName
          ? 'Unter diesem Namen gibt es keine gemeinsame Kasse. Stimmt die Schreibweise?'
          : 'Diese Kasse gibt es nicht mehr.');
      }
      if (code.includes('permission-denied')) {
        // Ob der Name daneben liegt oder das Passwort, verrät der Server
        // nicht — er lässt ein fremdes Gerät die Kasse ja gar nicht erst
        // lesen. Also nennt die Meldung beides.
        throw new Error(byName
          ? 'Name oder Passwort stimmt nicht. Beim Passwort zählt auch Groß- und Kleinschreibung.'
          : 'Diese Einladung gilt nicht mehr — bittet um eine neue.');
      }
      throw err;
    }
  }

  async saveTrip(trip) {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), pickTripFields(trip));
  }

  async setMyPerson(personId) {
    if (!this.uid) return;
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      [`members.${this.uid}.personId`]: personId,
    });
  }

  /**
   * Den hinterlegten Nachweis austauschen — das ist das Ändern des Passworts.
   * Was hier ankommt, ist nie das Passwort selbst, sondern der daraus
   * abgeleitete Wert aus `join.js`.
   */
  async setInviteCode(code) {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), { inviteCode: code });
    this.inviteCode = code;
  }

  /**
   * „Zuletzt gesehen“ am eigenen Eintrag nachziehen — einmal pro Sitzung.
   *
   * Daran erkennt die Gruppe, welches Gerät noch mitläuft und welches seit
   * Wochen nicht mehr da war. Ohne diese Zeile stünde in der Geräteliste nur
   * eine Kennung und ein Beitrittsdatum, und niemand könnte sagen, welches
   * davon das verlorene Handy ist.
   */
  _touchPresence() {
    if (this._touched || !this.uid || !this.db) return;
    if (!(this.data.trip?.memberUids || []).includes(this.uid)) return;
    this._touched = true;
    fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      [`members.${this.uid}.lastSeenAt`]: Date.now(),
    }).catch(() => {
      // Kein Netz, oder gerade ausgesperrt worden: beides kein Grund, hier
      // etwas anzuzeigen.
    });
  }

  /**
   * Ein Gerät aussperren.
   *
   * Allein reicht das nicht: den Beitrittsnachweis hat das Gerät noch, damit
   * stünde es sofort wieder drin. Deshalb wechselt `store.removeDevice`
   * gleichzeitig das Passwort — erst beides zusammen ist ein Aussperren.
   */
  async removeMember(uid) {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      memberUids: fb.arrayRemove(uid),
      [`members.${uid}`]: fb.deleteField(),
    });
  }

  /**
   * Löschauftrag stellen. Die Zeit setzt der Server (`serverTimestamp`), nicht
   * dieses Gerät — die Regeln bestehen darauf, sonst ließe sich die Bedenkzeit
   * mit einer verstellten Uhr überspringen.
   */
  async requestDelete({ personId = null } = {}) {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      deleteRequestedAt: fb.serverTimestamp(),
      deleteRequestedBy: this.uid,
      deleteRequestedByPerson: personId,
    });
  }

  /** Löschauftrag zurücknehmen — das darf jedes Gerät der Gruppe. */
  async cancelDelete() {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      deleteRequestedAt: fb.deleteField(),
      deleteRequestedBy: fb.deleteField(),
      deleteRequestedByPerson: fb.deleteField(),
    });
  }

  async putExpense(row) { await fb.setDoc(this._ref('expenses', row.id), stripId(row)); }
  async removeExpense(id) { await fb.deleteDoc(this._ref('expenses', id)); }
  async putContribution(row) { await fb.setDoc(this._ref('contributions', row.id), stripId(row)); }
  async removeContribution(id) { await fb.deleteDoc(this._ref('contributions', id)); }
  async putCashOut(row) { await fb.setDoc(this._ref('cashouts', row.id), stripId(row)); }
  async removeCashOut(id) { await fb.deleteDoc(this._ref('cashouts', id)); }
  async putPlanItem(row) { await fb.setDoc(this._ref('planitems', row.id), stripId(row)); }
  async removePlanItem(id) { await fb.deleteDoc(this._ref('planitems', id)); }
  async putPackItem(row) { await fb.setDoc(this._ref('packitems', row.id), stripId(row)); }
  async removePackItem(id) { await fb.deleteDoc(this._ref('packitems', id)); }

  /**
   * Sicherung einspielen: was nicht mehr drin vorkommt, fliegt raus. Läuft in
   * einem Rutsch, damit die andere Seite keinen Zwischenstand sieht.
   */
  async replaceAll({ trip, contributions = [], expenses = [], cashOuts = [], planItems = [], packItems = [] }) {
    const batch = fb.writeBatch(this.db);
    const keepContributions = new Set(contributions.map((c) => c.id));
    const keepExpenses = new Set(expenses.map((e) => e.id));
    const keepCashOuts = new Set(cashOuts.map((c) => c.id));
    const keepPlanItems = new Set(planItems.map((p) => p.id));
    const keepPackItems = new Set(packItems.map((p) => p.id));
    for (const c of this.data.contributions) if (!keepContributions.has(c.id)) batch.delete(this._ref('contributions', c.id));
    for (const e of this.data.expenses) if (!keepExpenses.has(e.id)) batch.delete(this._ref('expenses', e.id));
    for (const c of this.data.cashOuts) if (!keepCashOuts.has(c.id)) batch.delete(this._ref('cashouts', c.id));
    for (const p of this.data.planItems) if (!keepPlanItems.has(p.id)) batch.delete(this._ref('planitems', p.id));
    for (const p of this.data.packItems) if (!keepPackItems.has(p.id)) batch.delete(this._ref('packitems', p.id));
    for (const c of contributions) batch.set(this._ref('contributions', c.id), stripId(c));
    for (const e of expenses) batch.set(this._ref('expenses', e.id), stripId(e));
    for (const c of cashOuts) batch.set(this._ref('cashouts', c.id), stripId(c));
    for (const p of planItems) batch.set(this._ref('planitems', p.id), stripId(p));
    for (const p of packItems) batch.set(this._ref('packitems', p.id), stripId(p));
    batch.update(fb.doc(this.db, 'trips', this.tripId), pickTripFields(trip));
    await batch.commit();
  }

  /** Einen kompletten lokalen Trip in die Cloud schieben. */
  async importAll({ contributions = [], expenses = [], cashOuts = [], planItems = [], packItems = [] }) {
    const batch = fb.writeBatch(this.db);
    for (const c of contributions) batch.set(this._ref('contributions', c.id), stripId(c));
    for (const e of expenses) batch.set(this._ref('expenses', e.id), stripId(e));
    for (const c of cashOuts) batch.set(this._ref('cashouts', c.id), stripId(c));
    for (const p of planItems) batch.set(this._ref('planitems', p.id), stripId(p));
    for (const p of packItems) batch.set(this._ref('packitems', p.id), stripId(p));
    await batch.commit();
  }

  /** Dieses Gerät trägt sich selbst aus — beim Beenden der Synchronisierung. */
  async leave() {
    if (!this.uid || !this.db) return;
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      memberUids: fb.arrayRemove(this.uid),
      [`members.${this.uid}`]: fb.deleteField(),
    });
  }

  async deleteTrip() {
    // Unterordner löscht Firestore nicht mit — die Dokumente müssen einzeln weg.
    const batch = fb.writeBatch(this.db);
    for (const c of this.data.contributions) batch.delete(this._ref('contributions', c.id));
    for (const e of this.data.expenses) batch.delete(this._ref('expenses', e.id));
    for (const c of this.data.cashOuts) batch.delete(this._ref('cashouts', c.id));
    for (const p of this.data.planItems) batch.delete(this._ref('planitems', p.id));
    for (const p of this.data.packItems) batch.delete(this._ref('packitems', p.id));
    batch.delete(fb.doc(this.db, 'trips', this.tripId));
    await batch.commit();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }
}

function stripId({ id, ...rest }) {
  return rest;
}
