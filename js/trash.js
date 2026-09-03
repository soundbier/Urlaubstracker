/**
 * Der Sicherheitsgurt vor dem Löschen.
 *
 * „Urlaubskasse löschen“ war bisher endgültig, sofort und auf allen Geräten —
 * die einzige Rettung war eine Sicherungskopie, die vorher jemand von Hand
 * gespeichert hatte. Ein Fehlgriff kostete den ganzen Urlaub.
 *
 * Deshalb legt die App vor dem Löschen selbst eine Kopie ab, auf dem Gerät,
 * das gelöscht hat. Dieselbe Datei, die auch „Sicherungskopie speichern“
 * erzeugt: sie lässt sich zurückholen oder herunterladen.
 *
 * Sie liegt hier nicht ewig. Nach `TRASH_DAYS` Tagen räumt die App sie selbst
 * weg — sonst wäre die Löschung genau das nicht (Art. 17 DSGVO), und niemand
 * wüsste, dass die Ausgaben der Gruppe noch im Speicher des Browsers stehen.
 * Sofort weg geht auch: „Endgültig entfernen“.
 */
import { buildExport } from './link.js';

const KEY = 'urlaubstracker.trash.v1';

/** So lange lässt sich eine gelöschte Kasse noch zurückholen. */
export const TRASH_DAYS = 7;

/** Mehr als das nimmt der localStorage nicht verlässlich — dann lieber ehrlich nichts. */
const MAX_CHARS = 2000000;

const day = 86400000;

/**
 * Kopie ablegen. Gibt `false` zurück, wenn das nicht geklappt hat — die
 * Oberfläche sagt dann, dass es nur die Datei von Hand gibt.
 */
export function keepCopy({ trip, contributions = [], expenses = [], cashOuts = [] }) {
  if (!trip) return false;
  try {
    const json = buildExport({ trip, contributions, expenses, cashOuts });
    if (json.length > MAX_CHARS) return false;
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: Date.now(),
      name: trip.name || 'Urlaubskasse',
      entries: contributions.length + expenses.length + cashOuts.length,
      json,
    }));
    return true;
  } catch {
    return false;
  }
}

/** Die letzte gelöschte Kasse — oder `null`, wenn es keine gibt oder die Frist um ist. */
export function lastCopy() {
  let row;
  try {
    row = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    row = null;
  }
  if (!row?.json || !row.savedAt) return null;

  const expiresAt = row.savedAt + TRASH_DAYS * day;
  if (Date.now() > expiresAt) {
    discardCopy();
    return null;
  }
  return {
    ...row,
    expiresAt,
    daysLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / day)),
  };
}

export function discardCopy() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* egal */
  }
}
