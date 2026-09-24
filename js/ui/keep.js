/**
 * Was am Bild hängt und nicht in den Daten steht.
 *
 * Die Ansichten dieser App werden nicht abgeglichen, sondern neu gebaut. Das
 * hält `views/` einfach und ehrlich — jede Ansicht ist eine Funktion vom
 * Zustand auf Elemente, ohne Buchhaltung dazwischen —, und bezahlt wird es an
 * genau einer Stelle: alles, was der Browser am Knoten selbst führt, fällt
 * beim Austausch weg. Die Schreibmarke in dem Feld, in das gerade jemand
 * tippt. Wie weit die Seite gescrollt ist. Wie weit die Kategorieleiste zur
 * Seite geschoben wurde.
 *
 * Solange nur der eigene Finger etwas auslöst, merkt das niemand: neu gebaut
 * wird ja genau dann, wenn man selbst etwas angetippt hat. In der Gruppe
 * kommt die Änderung aber vom Handy nebenan, mitten im Tippen — und dann
 * steht der Finger im Nichts.
 *
 * Wiedergefunden wird ein Element nicht an seiner Stelle im Baum — die
 * verschiebt sich, sobald darüber eine Zeile dazukommt —, sondern an seiner
 * Beschreibung (Tag, Klassen, Art, Name, Kennung) und der Nummer unter
 * seinesgleichen. Passt danach nichts, bleibt eben alles, wie es ist: ein
 * Fokus, der nicht zurückkommt, ist ärgerlich — einer, der im falschen Feld
 * landet, ist schlimmer.
 */

/** Alle Elemente unter `root`, in der Reihenfolge des Dokuments. */
function* elements(root) {
  for (const node of root.childNodes || []) {
    if (!node.tagName) continue; // Textknoten
    yield node;
    yield* elements(node);
  }
}

// Die Symbole sind SVG, und dort steht unter `className` kein Wort, sondern
// ein Objekt — für sie zählt nur das Attribut.
const classesOf = (el) => (typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '');

/** Die Beschreibung, an der ein Element nach dem Neuaufbau wiedererkannt wird. */
const describe = (el) => [el.tagName, classesOf(el), el.type || '', el.name || '', el.id || ''].join('|');

const pageOffset = () => (typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0);

/**
 * Festhalten, was gleich verloren ginge. Ein Durchgang durch den Baum, und
 * zwar nur dann, wenn wirklich neu gebaut wird — im Normalfall passiert
 * nämlich gar nichts (siehe `app.renderShell`).
 */
export function capture(root) {
  const active = globalThis.document?.activeElement || null;
  const kept = { page: pageOffset(), focus: null, scroll: [] };
  const seen = new Map();

  for (const el of elements(root)) {
    const desc = describe(el);
    const nth = seen.get(desc) || 0;
    seen.set(desc, nth + 1);

    if (el === active) {
      const { selectionStart: start, selectionEnd: end } = el;
      kept.focus = { el, desc, nth, start: typeof start === 'number' ? start : null, end: typeof end === 'number' ? end : null };
    }
    // Fast immer nichts: seitlich verschiebbar sind nur die Kategorie- und
    // Reiterleisten, und auch die stehen meistens ganz links.
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      kept.scroll.push({ el, desc, nth, top: el.scrollTop, left: el.scrollLeft });
    }
  }
  return kept;
}

/**
 * Und zurück. `page: false` für den Reiterwechsel: eine neu aufgeschlagene
 * Ansicht beginnt oben, die Stelle aus der vorigen gehört nicht hierher.
 */
export function restore(root, kept, { page = true } = {}) {
  if (!kept) return;

  const jobs = kept.scroll.map((s) => ({
    ...s,
    run: (el) => { el.scrollTop = s.top; el.scrollLeft = s.left; },
  }));
  if (kept.focus) jobs.push({ ...kept.focus, run: (el) => refocus(el, kept.focus) });

  // Was den Neuaufbau überstanden hat, braucht keine Beschreibung: es ist
  // schon das richtige Element, und zwar sicherer, als eine Beschreibung es je
  // sein kann. Die Navigation etwa tauscht beim Reiterwechsel nur ihre
  // Markierung aus — danach passt die Beschreibung des angetippten Knopfes auf
  // seinen Nachbarn, und der bekäme den Fokus.
  const lost = jobs.filter((job) => {
    if (!job.el?.isConnected) return true;
    job.run(job.el);
    return false;
  });

  if (lost.length) {
    const seen = new Map();
    for (const el of elements(root)) {
      const desc = describe(el);
      const nth = seen.get(desc) || 0;
      seen.set(desc, nth + 1);
      for (const job of lost) if (job.nth === nth && job.desc === desc) job.run(el);
    }
  }

  // Die Seite zuletzt: das Zurückholen des Fokus kann sie verschieben, und
  // dann stünde hier die falsche Zahl.
  if (page) globalThis.scrollTo?.(0, kept.page);
}

function refocus(el, { start, end }) {
  if (typeof el.focus !== 'function') return;
  // Ohne `preventScroll` springt die Seite zum Feld — und genau die Stelle,
  // an der jemand gerade liest, wollen wir ja behalten.
  el.focus({ preventScroll: true });
  if (start === null || typeof el.setSelectionRange !== 'function') return;
  try {
    el.setSelectionRange(start, end);
  } catch {
    // Zahlen- und Datumsfelder haben keine Schreibmarke, die sich setzen
    // ließe, und werfen dafür. Der Fokus allein tut es dann auch.
  }
}
