/**
 * Einladungslinks und Datenexport.
 *
 * Der Einladungslink trägt alles, was das zweite Gerät braucht: die
 * Firebase-Konfiguration (die ist ohnehin öffentlich, geschützt wird über die
 * Sicherheitsregeln), die Trip-Kennung und den Einladungscode. Er steht im
 * Fragment der URL — das schickt der Browser nie an einen Server.
 */
import { CATEGORY_BY_ID, POT, isValidDate, isCashPayer, cashPayerPerson } from './calc.js';

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildInviteLink({ tripId, inviteCode, config, tripName }) {
  const payload = toBase64Url(JSON.stringify({ v: 1, t: tripId, c: inviteCode, f: config, n: tripName }));
  const base = `${location.origin}${location.pathname}`;
  return `${base}#einladung=${payload}`;
}

export function readInviteFromLocation(hash = location.hash) {
  const m = /[#&]einladung=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const data = JSON.parse(fromBase64Url(m[1]));
    if (!data?.t || !data?.c) return null;
    return { tripId: data.t, inviteCode: data.c, config: data.f || null, tripName: data.n || '' };
  } catch {
    return null;
  }
}

export function clearInviteFromLocation() {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

/** Vollständige Sicherungskopie als JSON-Datei. */
export function buildExport({ trip, contributions, expenses, cashOuts = [] }) {
  return JSON.stringify(
    {
      format: 'urlaubstracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
      contributions,
      expenses,
      cashOuts,
    },
    null,
    2,
  );
}

/**
 * Liest eine Sicherungskopie und prüft dabei, was die App danach voraussetzt:
 * ein gültiger Zeitraum und mindestens eine Person. Eine halbe Datei durchzulassen
 * hieße, den bestehenden Trip gegen einen zu tauschen, an dem die App beim
 * nächsten Aufbau abbricht — und der alte Stand ist dann schon überschrieben.
 */
export function parseImport(text) {
  const data = JSON.parse(text);
  if (data?.format !== 'urlaubstracker' || !data.trip || typeof data.trip !== 'object') {
    throw new Error('Das ist keine Sicherungskopie des Urlaubstrackers.');
  }

  const t = data.trip;
  if (!isValidDate(t.startDate) || !isValidDate(t.endDate) || t.endDate < t.startDate) {
    throw new Error('Der Zeitraum in der Datei fehlt oder ergibt keinen Sinn.');
  }

  const people = (Array.isArray(t.people) ? t.people : [])
    .filter((p) => p && typeof p.id === 'string' && p.id)
    .map((p, i) => ({ ...p, name: String(p.name || '').trim() || `Person ${i + 1}` }));
  if (!people.length) throw new Error('In der Datei steht keine einzige Person.');

  const knownPerson = new Set(people.map((p) => p.id));
  // Ein Bargeld-Zahler ohne bekannte Person dahinter ist so unbrauchbar wie
  // jeder andere unbekannte Zahler — fällt zurück auf die Kasse.
  const validPayer = (payer) => payer === POT || knownPerson.has(payer) || (isCashPayer(payer) && knownPerson.has(cashPayerPerson(payer)));
  // Beträge sind ganzzahlige Cent; alles andere würde sich durch die ganze
  // Rechnung ziehen und dort als NaN wieder auftauchen.
  const usableAmount = (v) => Number.isInteger(v) && v !== 0;
  const rows = (list, extra) =>
    (Array.isArray(list) ? list : []).filter((r) => r && typeof r.id === 'string' && usableAmount(r.amount) && isValidDate(r.date) && extra(r));

  return {
    trip: {
      ...t,
      name: String(t.name || '').trim() || 'Unser Urlaub',
      currency: typeof t.currency === 'string' && t.currency ? t.currency : 'EUR',
      budgetMode: t.budgetMode === 'fixed' ? 'fixed' : 'dynamic',
      people,
    },
    // Einzahlungen und Auszahlungen ohne bekannte Person würden in der
    // Abrechnung Geld erfinden bzw. verschwinden lassen.
    contributions: rows(data.contributions, (c) => knownPerson.has(c.personId)),
    cashOuts: rows(data.cashOuts, (c) => knownPerson.has(c.personId)),
    expenses: rows(data.expenses, () => true).map((e) => ({
      ...e,
      category: CATEGORY_BY_ID[e.category] ? e.category : 'other',
      payer: validPayer(e.payer) ? e.payer : POT,
      // Nur eine echte Marke zählt; alles andere ist eine bezahlte Ausgabe.
      planned: e.planned === true,
      fromPlan: e.fromPlan === true && e.planned !== true,
    })),
  };
}

/** Ausgaben als CSV, für Tabellenkalkulationen. */
export function buildCsv({ trip, expenses, contributions, cashOuts = [] }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const money = (cents) => (cents / 100).toFixed(2).replace('.', ',');
  const personName = (id) => trip.people.find((p) => p.id === id)?.name || 'Unbekannt';
  // In der Tabelle stehen die Namen, die auch in der App stehen — nicht die
  // internen Kennungen wie `food` oder `pot`.
  const categoryLabel = (id) => (CATEGORY_BY_ID[id] || CATEGORY_BY_ID.other).label;
  const payerLabel = (payer) => {
    if (payer === POT) return 'Gemeinsame Kasse';
    if (isCashPayer(payer)) return `Bargeld (${personName(cashPayerPerson(payer))})`;
    return personName(payer);
  };
  const lines = [['Art', 'Datum', 'Betrag', 'Kategorie', 'Bezahlt von', 'Notiz'].map(esc).join(';')];

  for (const c of [...contributions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(['Einzahlung', c.date, money(c.amount), '', personName(c.personId), c.note].map(esc).join(';'));
  }
  for (const c of [...cashOuts].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(['Bargeld ausgezahlt', c.date, money(c.amount), '', personName(c.personId), c.note].map(esc).join(';'));
  }
  for (const e of [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    // Vorgemerktes steht mit eigener Art da — sonst zählte eine Tabelle Geld
    // mit, das noch gar nicht ausgegeben ist.
    lines.push([e.planned === true ? 'Verplant' : 'Ausgabe', e.date, money(e.amount), categoryLabel(e.category), payerLabel(e.payer), e.note].map(esc).join(';'));
  }
  // BOM, damit Excel die Umlaute richtig liest.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
