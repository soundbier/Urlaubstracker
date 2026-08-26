/**
 * Backend mit Firestore: beide Handys hängen am selben Trip.
 *
 * Firestore hält die Daten selbst offline vor und schiebt Änderungen nach,
 * sobald wieder Netz da ist. Für die App heißt das: schreiben geht immer,
 * auch ohne Empfang, und `fromCache` sagt uns, ob wir gerade nur den lokalen
 * Stand sehen.
 *
 * Zugriff regelt `firestore.rules`: lesen und schreiben darf, wer in
 * `memberUids` steht. Beitreten darf, wer den Einladungscode kennt.
 */
import * as fb from '../vendor/firebase.js';

const APP_NAME = 'urlaubstracker';

/** Felder des Trips, die der App gehören — Sync-Felder rühren wir nicht an. */
const TRIP_FIELDS = ['name', 'startDate', 'endDate', 'currency', 'budgetMode', 'people', 'updatedAt'];

function pickTripFields(trip) {
  const out = {};
  for (const k of TRIP_FIELDS) if (trip[k] !== undefined) out[k] = trip[k];
  return out;
}

/** Firestore-Fehler in etwas übersetzen, das man einer Person zeigen kann. */
export function describeError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) {
    return 'Kein Zugriff auf diesen Trip. Stimmt der Einladungscode? Und sind die Sicherheitsregeln aus firestore.rules veröffentlicht?';
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

    this.app = null;
    this.db = null;
    this.uid = null;

    this.data = { trip: null, contributions: [], expenses: [] };
    this.onChange = null;
    this.onStatus = null;
    this._unsubs = [];
    this._status = { mode: 'cloud', connected: false, ready: false, fromCache: true, pending: 0, error: null };
  }

  // ---------------------------------------------------------------- Verbindung

  async _connect() {
    const existing = fb.getApps().find((a) => a.name === APP_NAME);
    if (existing) await fb.deleteApp(existing);

    this.app = fb.initializeApp(this.config, APP_NAME);
    this.db = fb.initializeFirestore(this.app, {
      localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    });

    const auth = fb.getAuth(this.app);
    await fb.setPersistence(auth, fb.browserLocalPersistence);
    this.uid = await new Promise((resolve, reject) => {
      const off = fb.onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            off();
            resolve(user.uid);
          }
        },
        (err) => {
          off();
          reject(err);
        },
      );
      fb.signInAnonymously(auth).catch((err) => {
        off();
        reject(err);
      });
    });
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
    const openWrites = { expenses: 0, contributions: 0 };

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
            pending: openWrites.expenses + openWrites.contributions,
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
          this.data.trip = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          if (this.data.trip?.inviteCode) this.inviteCode = this.data.trip.inviteCode;
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
    if (this.app) {
      try {
        await fb.deleteApp(this.app);
      } catch {
        /* egal */
      }
      this.app = null;
    }
  }

  // ------------------------------------------------------------------ Schreiben

  _ref(name, id) {
    return fb.doc(this.db, 'trips', this.tripId, name, id);
  }

  async createTrip(trip, me) {
    if (!this.db) await this._connect();
    await fb.setDoc(fb.doc(this.db, 'trips', this.tripId), {
      ...pickTripFields(trip),
      createdAt: trip.createdAt || Date.now(),
      inviteCode: this.inviteCode,
      memberUids: [this.uid],
      members: { [this.uid]: { personId: me?.personId || null, joinedAt: Date.now() } },
    });
  }

  /**
   * Einem bestehenden Trip beitreten. Die Regeln prüfen `joinProof` gegen den
   * Einladungscode im Dokument — den kann das Gerät vorher nicht lesen, deshalb
   * schicken wir ihn mit und lassen den Server vergleichen.
   */
  async join(me) {
    if (!this.db) await this._connect();
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      memberUids: fb.arrayUnion(this.uid),
      joinProof: this.inviteCode,
      [`members.${this.uid}`]: { personId: me?.personId || null, joinedAt: Date.now() },
    });
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

  async rotateInviteCode(code) {
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), { inviteCode: code });
    this.inviteCode = code;
  }

  async putExpense(row) { await fb.setDoc(this._ref('expenses', row.id), stripId(row)); }
  async removeExpense(id) { await fb.deleteDoc(this._ref('expenses', id)); }
  async putContribution(row) { await fb.setDoc(this._ref('contributions', row.id), stripId(row)); }
  async removeContribution(id) { await fb.deleteDoc(this._ref('contributions', id)); }

  /**
   * Sicherung einspielen: was nicht mehr drin vorkommt, fliegt raus. Läuft in
   * einem Rutsch, damit die andere Seite keinen Zwischenstand sieht.
   */
  async replaceAll({ trip, contributions = [], expenses = [] }) {
    const batch = fb.writeBatch(this.db);
    const keepContributions = new Set(contributions.map((c) => c.id));
    const keepExpenses = new Set(expenses.map((e) => e.id));
    for (const c of this.data.contributions) if (!keepContributions.has(c.id)) batch.delete(this._ref('contributions', c.id));
    for (const e of this.data.expenses) if (!keepExpenses.has(e.id)) batch.delete(this._ref('expenses', e.id));
    for (const c of contributions) batch.set(this._ref('contributions', c.id), stripId(c));
    for (const e of expenses) batch.set(this._ref('expenses', e.id), stripId(e));
    batch.update(fb.doc(this.db, 'trips', this.tripId), pickTripFields(trip));
    await batch.commit();
  }

  /** Einen kompletten lokalen Trip in die Cloud schieben. */
  async importAll({ contributions = [], expenses = [] }) {
    const batch = fb.writeBatch(this.db);
    for (const c of contributions) batch.set(this._ref('contributions', c.id), stripId(c));
    for (const e of expenses) batch.set(this._ref('expenses', e.id), stripId(e));
    await batch.commit();
  }

  async leave() {
    if (!this.uid) return;
    await fb.updateDoc(fb.doc(this.db, 'trips', this.tripId), {
      memberUids: fb.arrayRemove(this.uid),
    });
  }

  async deleteTrip() {
    // Unterordner löscht Firestore nicht mit — die Dokumente müssen einzeln weg.
    const batch = fb.writeBatch(this.db);
    for (const c of this.data.contributions) batch.delete(this._ref('contributions', c.id));
    for (const e of this.data.expenses) batch.delete(this._ref('expenses', e.id));
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
