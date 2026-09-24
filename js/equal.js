/**
 * Inhaltlich gleich?
 *
 * Beide Backends reichen bei jeder Änderung den ganzen Stand als frische
 * Felder herein (siehe `_emit` dort), und Firestore meldet sich pro
 * Schreibvorgang mehrfach: einmal mit dem eigenen, noch unbestätigten Stand,
 * einmal mit dem vom Server bestätigten, dazu bei jeder Änderung an den
 * Metadaten. Jedes Mal stehen andere Objekte darin, obwohl nichts anderes
 * darin steht.
 *
 * Wer darauf die Oberfläche neu baut, baut sie den halben Urlaub umsonst neu —
 * und reißt dabei jedem, der gerade tippt, die Schreibmarke aus dem Feld.
 * Deshalb vergleicht der Store den neuen Stand mit dem alten und behält den
 * alten, wo sich nichts geändert hat (`keepSame`). Erst dadurch heißt
 * „dasselbe Feld“ wieder „dieselben Daten“, und `app.render` kann sich darauf
 * verlassen.
 *
 * Verglichen wird, was aus JSON kommt: Zahlen, Zeichenketten, Wahrheitswerte,
 * null, Felder und einfache Objekte. Mehr liegt in einer Urlaubskasse nicht.
 */

export function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => same(v, b[i]));
  }

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  // `undefined` und „steht gar nicht drin“ sind in JSON dasselbe, für einen
  // Vergleich der Werte aber nicht — deshalb wird hier nach dem Schlüssel
  // gefragt und nicht nur nach dem, was unter ihm steht.
  return keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}

/** Der alte Stand, wenn nichts Neues darin steht — sonst der neue. */
export function keepSame(prev, next) {
  return same(prev, next) ? prev : next;
}
