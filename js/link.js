/**
 * Einladungslinks und Datenexport.
 *
 * Der Einladungslink trägt alles, was das zweite Gerät braucht: die
 * Firebase-Konfiguration (die ist ohnehin öffentlich, geschützt wird über die
 * Sicherheitsregeln), die Trip-Kennung und den Einladungscode. Er steht im
 * Fragment der URL — das schickt der Browser nie an einen Server.
 */

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
export function buildExport({ trip, contributions, expenses }) {
  return JSON.stringify(
    {
      format: 'urlaubstracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
      contributions,
      expenses,
    },
    null,
    2,
  );
}

export function parseImport(text) {
  const data = JSON.parse(text);
  if (data?.format !== 'urlaubstracker' || !data.trip) {
    throw new Error('Das ist keine Sicherungskopie des Urlaubstrackers.');
  }
  return {
    trip: data.trip,
    contributions: Array.isArray(data.contributions) ? data.contributions : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
  };
}

/** Ausgaben als CSV, für Tabellenkalkulationen. */
export function buildCsv({ trip, expenses, contributions }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const money = (cents) => (cents / 100).toFixed(2).replace('.', ',');
  const personName = (id) => trip.people.find((p) => p.id === id)?.name || id;
  const lines = [['Art', 'Datum', 'Betrag', 'Kategorie', 'Bezahlt von', 'Notiz'].map(esc).join(';')];

  for (const c of [...contributions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(['Einzahlung', c.date, money(c.amount), '', personName(c.personId), c.note].map(esc).join(';'));
  }
  for (const e of [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const payer = e.payer === 'pot' ? 'Gemeinsame Kasse' : personName(e.payer);
    lines.push(['Ausgabe', e.date, money(e.amount), e.category, payer, e.note].map(esc).join(';'));
  }
  // BOM, damit Excel die Umlaute richtig liest.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
