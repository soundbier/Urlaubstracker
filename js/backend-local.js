/**
 * Backend ohne Cloud: alles liegt im localStorage dieses Geräts.
 *
 * Das ist der Startzustand — die App ist sofort benutzbar, ohne Konto und ohne
 * Einrichtung. Wer später Firestore verbindet, kann den Trip hochladen.
 */

const KEY = 'urlaubstracker.data.v1';

const EMPTY = { trip: null, contributions: [], expenses: [] };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY };
    return {
      trip: raw.trip || null,
      contributions: Array.isArray(raw.contributions) ? raw.contributions : [],
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export class LocalBackend {
  constructor() {
    this.mode = 'local';
    this.data = load();
    this.onChange = null;
    this._onStorage = (e) => {
      // Zweiter Tab auf demselben Gerät hat geschrieben.
      if (e.key === KEY) {
        this.data = load();
        this._emit();
      }
    };
  }

  async start(onChange, onStatus) {
    this.onChange = onChange;
    addEventListener('storage', this._onStorage);
    onStatus?.({ mode: 'local', connected: true, ready: true });
    this._emit();
  }

  async stop() {
    removeEventListener('storage', this._onStorage);
    this.onChange = null;
  }

  _emit() {
    this.onChange?.({ ...this.data, contributions: [...this.data.contributions], expenses: [...this.data.expenses] });
  }

  _persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      // Speicher voll oder gesperrt: die Sitzung läuft weiter, aber wir sagen es.
      this.onError?.(err);
    }
    this._emit();
  }

  _put(list, row) {
    const i = this.data[list].findIndex((x) => x.id === row.id);
    if (i === -1) this.data[list].push(row);
    else this.data[list][i] = row;
    this._persist();
  }

  _remove(list, id) {
    this.data[list] = this.data[list].filter((x) => x.id !== id);
    this._persist();
  }

  async createTrip(trip) {
    this.data = { trip, contributions: [], expenses: [] };
    this._persist();
  }

  async saveTrip(trip) {
    this.data.trip = trip;
    this._persist();
  }

  async deleteTrip() {
    this.data = { ...EMPTY, contributions: [], expenses: [] };
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* egal */
    }
    this._emit();
  }

  async putExpense(row) { this._put('expenses', row); }
  async removeExpense(id) { this._remove('expenses', id); }
  async putContribution(row) { this._put('contributions', row); }
  async removeContribution(id) { this._remove('contributions', id); }

  /** Für den Umzug in die Cloud. */
  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  async replaceAll({ trip, contributions = [], expenses = [] }) {
    this.data = { trip, contributions, expenses };
    this._persist();
  }
}
