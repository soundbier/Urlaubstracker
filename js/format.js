/** Zahlen und Daten so anzeigen, wie man sie in Deutschland liest. */

const LOCALE = 'de-DE';

const moneyCache = new Map();
function moneyFormatter(currency, decimals) {
  const key = `${currency}:${decimals}`;
  if (!moneyCache.has(key)) {
    moneyCache.set(
      key,
      new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return moneyCache.get(key);
}

export function money(cents, currency = 'EUR', { decimals = 2 } = {}) {
  // Echtes Minuszeichen statt Bindestrich — sonst steht es neben `moneySigned`
  // uneinheitlich da und ist bei Ziffern in Tabellenbreite zu kurz.
  return moneyFormatter(currency, decimals).format((cents || 0) / 100).replace('-', '−');
}

/** Vorzeichen immer sichtbar — für Polster und Guthaben. */
export function moneySigned(cents, currency = 'EUR') {
  const s = money(Math.abs(cents), currency);
  return `${cents < 0 ? '−' : '+'} ${s}`;
}

export function number(n, decimals = 0) {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function toDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dfWeekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const dfDay = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
const dfDayShort = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' });
const dfFull = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dfCompact = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });

export const weekdayShort = (iso) => dfWeekdayShort.format(toDate(iso));
export const dayMonth = (iso) => dfDay.format(toDate(iso));
export const dayMonthShort = (iso) => dfDayShort.format(toDate(iso));
export const fullDate = (iso) => dfFull.format(toDate(iso));
/** „2. Sept." — wenn nur wenig Platz ist. */
export const compactDate = (iso) => dfCompact.format(toDate(iso));

/** „Heute“, „Gestern“, sonst „Mi, 3. Juli“. */
export function dayLabel(iso, today, { compact = false } = {}) {
  if (iso === today) return 'Heute';
  const diff = Math.round((toDate(iso) - toDate(today)) / 86400000);
  if (diff === -1) return 'Gestern';
  if (diff === 1) return 'Morgen';
  return `${weekdayShort(iso)}, ${compact ? compactDate(iso) : dayMonth(iso)}`;
}

/** „3 Tage“, „1 Tag“ — mit richtiger Mehrzahl. */
export function days(n) {
  return `${number(n)} ${n === 1 ? 'Tag' : 'Tage'}`;
}

export function plural(n, one, many) {
  return `${number(n)} ${n === 1 ? one : many}`;
}
