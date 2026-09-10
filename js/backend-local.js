/**
 * Backend ohne Cloud: alles liegt verschlüsselt im localStorage dieses Geräts.
 *
 * Das ist der Startzustand — die App ist sofort benutzbar, ohne Konto und ohne
 * Einrichtung. Wer später Firestore verbindet, kann den Trip hochladen.
 *
 * Verschlüsselt wird der ganze Datensatz auf einmal (siehe `secure-storage.js`),
 * nicht Feld für Feld — Name, Beträge, Notizen sind zusammen die Kasse einer
 * Reisegruppe, keine einzelne Zahl darin ist weniger schützenswert als die
 * andere.
 */
import { secureRead, secureWrite, secureRemove, SecureStorageError } from './secure-storage.js';

const KEY = 'urlaubstracker.data.v1';

const EMPTY = { trip: null, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [], stays: [] };

/**
 * Gibt den gespeicherten Stand zurück — oder `EMPTY`, wenn nichts da ist,
 * das JSON kaputt ist, oder sich der Datensatz nicht entschlüsseln ließ.
 * `corrupted` unterscheidet den letzten Fall von den ersten beiden: „nichts
 * da“ ist der ganz normale erste Start, ein nicht entschlüsselbarer
 * Datensatz dagegen ist etwas, das die Oberfläche melden sollte statt es
 * stillschweigend als leere Kasse auszugeben.
 */
async function load() {
  try {
    const raw = await secureRead(KEY);
    if (!raw || typeof raw !== 'object') return { ...EMPTY, corrupted: false };
    return {
      trip: raw.trip || null,
      contributions: Array.isArray(raw.contributions) ? raw.contributions : [],
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      cashOuts: Array.isArray(raw.cashOuts) ? raw.cashOuts : [],
      planItems: Array.isArray(raw.planItems) ? raw.planItems : [],
      packItems: Array.isArray(raw.packItems) ? raw.packItems : [],
      stays: Array.isArray(raw.stays) ? raw.stays : [],
      corrupted: false,
    };
  } catch (err) {
    return { ...EMPTY, corrupted: err instanceof SecureStorageError };
  }
}

export class LocalBackend {
  constructor() {
    this.mode = 'local';
    // Erst mit leerem Stand, bis `start()` den echten (entschlüsselten) Stand
    // geladen hat — Entschlüsseln ist unvermeidlich asynchron, ein
    // Konstruktor nicht.
    this.data = { ...EMPTY };
    this.onChange = null;
    this.onStatus = null;
    this._onStorage = async (e) => {
      // Zweiter Tab auf demselben Gerät hat geschrieben.
      if (e.key === KEY) {
        const { corrupted, ...data } = await load();
        this.data = data;
        this._emit();
        if (corrupted) this.onStatus?.({ error: CORRUPTED_MESSAGE });
      }
    };
  }

  async start(onChange, onStatus) {
    this.onChange = onChange;
    this.onStatus = onStatus;
    const { corrupted, ...data } = await load();
    this.data = data;
    addEventListener('storage', this._onStorage);
    onStatus?.({ mode: 'local', connected: true, ready: true, error: corrupted ? CORRUPTED_MESSAGE : null });
    this._emit();
  }

  async stop() {
    removeEventListener('storage', this._onStorage);
    this.onChange = null;
    this.onStatus = null;
  }

  _emit() {
    this.onChange?.({
      ...this.data,
      contributions: [...this.data.contributions],
      expenses: [...this.data.expenses],
      cashOuts: [...this.data.cashOuts],
      planItems: [...this.data.planItems],
      packItems: [...this.data.packItems],
      stays: [...this.data.stays],
    });
  }

  async _persist() {
    try {
      await secureWrite(KEY, this.data);
      this.onStatus?.({ error: null });
    } catch {
      // Speicher voll oder gesperrt (privates Fenster). Der Eintrag steht im
      // Arbeitsspeicher und die Sitzung läuft weiter — beim nächsten Start
      // wäre er aber weg, und genau das muss auf dem Schirm stehen.
      this.onStatus?.({ error: 'Dieses Gerät speichert gerade nichts — Einträge sind nach einem Neustart weg. Am besten eine Sicherungskopie exportieren.' });
    }
    this._emit();
  }

  async _put(list, row) {
    const i = this.data[list].findIndex((x) => x.id === row.id);
    if (i === -1) this.data[list].push(row);
    else this.data[list][i] = row;
    await this._persist();
  }

  async _remove(list, id) {
    this.data[list] = this.data[list].filter((x) => x.id !== id);
    await this._persist();
  }

  async createTrip(trip) {
    this.data = { trip, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [], stays: [] };
    await this._persist();
  }

  async saveTrip(trip) {
    this.data.trip = trip;
    await this._persist();
  }

  async deleteTrip() {
    this.data = { ...EMPTY, contributions: [], expenses: [], cashOuts: [], planItems: [], packItems: [], stays: [] };
    try {
      secureRemove(KEY);
    } catch {
      /* egal */
    }
    this._emit();
  }

  async putExpense(row) { await this._put('expenses', row); }
  async removeExpense(id) { await this._remove('expenses', id); }
  async putContribution(row) { await this._put('contributions', row); }
  async removeContribution(id) { await this._remove('contributions', id); }
  async putCashOut(row) { await this._put('cashOuts', row); }
  async removeCashOut(id) { await this._remove('cashOuts', id); }
  async putPlanItem(row) { await this._put('planItems', row); }
  async removePlanItem(id) { await this._remove('planItems', id); }
  async putPackItem(row) { await this._put('packItems', row); }
  async removePackItem(id) { await this._remove('packItems', id); }
  async putStay(row) { await this._put('stays', row); }
  async removeStay(id) { await this._remove('stays', id); }

  async replaceAll({ trip, contributions = [], expenses = [], cashOuts = [], planItems = [], packItems = [], stays = [] }) {
    this.data = { trip, contributions, expenses, cashOuts, planItems, packItems, stays };
    await this._persist();
  }
}

const CORRUPTED_MESSAGE = 'Die gespeicherten Daten ließen sich nicht entschlüsseln — vermutlich ein anderes Gerät oder ein geleerter Browser-Speicher. Die Kasse startet leer; mit einer Sicherungskopie lässt sie sich zurückholen.';
