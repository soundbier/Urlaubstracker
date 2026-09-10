/**
 * Der Sicherheitsgurt vor dem Löschen.
 *
 * „Urlaubskasse löschen“ war bisher endgültig, sofort und auf allen Geräten —
 * die einzige Rettung war eine Sicherungskopie, die vorher jemand von Hand
 * gespeichert hatte. Ein Fehlgriff kostete den ganzen Urlaub.
 *
 * Deshalb legt die App vor dem Löschen selbst eine Kopie ab, auf dem Gerät,
 * das gelöscht hat. Dieselbe Datei, die auch „Sicherungskopie speichern“
 * erzeugt: sie lässt sich zurückholen oder herunterladen. Verschlüsselt wie
 * jede andere Ablage dieses Geräts (siehe `secure-storage.js`) — eine
 * gelöschte Kasse ist in den sieben Tagen bis zum endgültigen Wegräumen
 * genauso schützenswert wie eine, die noch aktiv läuft.
 *
 * Sie liegt hier nicht ewig. Nach `TRASH_DAYS` Tagen räumt die App sie selbst
 * weg — sonst wäre die Löschung genau das nicht (Art. 17 DSGVO), und niemand
 * wüsste, dass die Ausgaben der Gruppe noch im Speicher des Browsers stehen.
 * Sofort weg geht auch: „Endgültig entfernen“.
 */
import { buildExport } from './link.js';
import { secureRead, secureWrite, secureRemove } from './secure-storage.js';

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
export async function keepCopy({ trip, contributions = [], expenses = [], cashOuts = [], planItems = [], packItems = [], stays = [] }) {
  if (!trip) return false;
  try {
    const json = buildExport({ trip, contributions, expenses, cashOuts, planItems, packItems, stays });
    if (json.length > MAX_CHARS) return false;
    await secureWrite(KEY, {
      savedAt: Date.now(),
      name: trip.name || 'Urlaubskasse',
      // Was hier gezählt wird, steht der Person auf dem Schirm, die gerade
      // gelöscht hat — es muss also alles sein, was verloren ginge, nicht nur
      // das Geld. Reiseplan, Packliste und Unterkünfte zählen mit.
      entries: contributions.length + expenses.length + cashOuts.length + planItems.length + packItems.length + stays.length,
      json,
    });
    return true;
  } catch {
    return false;
  }
}

/** Die letzte gelöschte Kasse — oder `null`, wenn es keine gibt, die Frist um ist, oder sie sich nicht lesen lässt. */
export async function lastCopy() {
  let row;
  try {
    row = await secureRead(KEY);
  } catch {
    row = null; // beschädigt oder mit fremdem Schlüssel verschlüsselt — dann lieber ehrlich nichts
  }
  if (!row?.json || !row.savedAt) return null;

  const expiresAt = row.savedAt + TRASH_DAYS * day;
  if (Date.now() > expiresAt) {
    await discardCopy();
    return null;
  }
  return {
    ...row,
    expiresAt,
    daysLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / day)),
  };
}

export async function discardCopy() {
  try {
    secureRemove(KEY);
  } catch {
    /* egal */
  }
}
