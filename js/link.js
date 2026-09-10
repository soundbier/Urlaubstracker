/**
 * Einladungslinks und Datenexport.
 *
 * Der Einladungslink trägt alles, was das zweite Gerät braucht: die
 * Firebase-Konfiguration (die ist ohnehin öffentlich, geschützt wird über die
 * Sicherheitsregeln), die Trip-Kennung und den Einladungscode. Er steht im
 * Fragment der URL — das schickt der Browser nie an einen Server.
 */
import {
  CATEGORY_BY_ID, POT, isValidDate, isCashPayer, cashPayerPerson, MAX_PEOPLE,
  PACK_CATEGORY_BY_ID, PACK_STATUS_BY_ID, PACK_BAG_BY_ID, packSub, packSubLabel, packQty,
  PLAN_CATEGORY_BY_ID, planSub, planSubLabel,
} from './calc.js';

// Wie viele Zeilen eine Sicherung je Liste höchstens mitbringen darf. Eine
// echte Kasse (höchstens MAX_PEOPLE Personen, ein einzelner Urlaub) kommt
// darunter nie in die Nähe — die Grenze fängt nur ab, was eine verunstaltete
// oder mutwillig aufgeblähte Datei sonst an Rechenzeit kostet und was den
// Firestore-Batch beim Einspielen sprengen würde.
const MAX_IMPORT_ROWS = 2000;

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
export function buildExport({ trip, contributions, expenses, cashOuts = [], planItems = [], packItems = [], stays = [] }) {
  return JSON.stringify(
    {
      format: 'urlaubstracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
      contributions,
      expenses,
      cashOuts,
      planItems,
      packItems,
      stays,
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
  // Vor jedem Aufbereiten der Listen: eine Datei mit Zehntausenden Zeilen ist
  // so oder so keine echte Sicherung. Der Test steht vor der ganzen restlichen
  // Prüfung, damit so eine Datei nicht erst noch durch alle `map()`/`filter()`
  // unten läuft.
  for (const [list, label] of [
    [data.contributions, 'Einzahlungen'],
    [data.expenses, 'Ausgaben'],
    [data.cashOuts, 'Auszahlungen'],
    [data.planItems, 'Programmpunkte'],
    [data.packItems, 'Packlisten-Einträge'],
    [data.stays, 'Unterkünfte'],
  ]) {
    if (Array.isArray(list) && list.length > MAX_IMPORT_ROWS) {
      throw new Error(`Die Datei enthält zu viele ${label} für eine Sicherung.`);
    }
  }

  const t = data.trip;
  if (!isValidDate(t.startDate) || !isValidDate(t.endDate) || t.endDate < t.startDate) {
    throw new Error('Der Zeitraum in der Datei fehlt oder ergibt keinen Sinn.');
  }

  const people = (Array.isArray(t.people) ? t.people : [])
    .filter((p) => p && typeof p.id === 'string' && p.id)
    .map((p, i) => ({ ...p, name: String(p.name || '').trim() || `Person ${i + 1}` }));
  if (!people.length) throw new Error('In der Datei steht keine einzige Person.');
  // Dieselbe Grenze wie beim Anlegen und beim Einladen (siehe `store.js`) —
  // eine Sicherung darf keinen Trip durchlassen, den die App selbst nie
  // hätte anlegen können.
  if (people.length > MAX_PEOPLE) throw new Error(`Mehr als ${MAX_PEOPLE} Personen kann eine Kasse nicht führen.`);

  const knownPerson = new Set(people.map((p) => p.id));
  // Ein Bargeld-Zahler ohne bekannte Person dahinter ist so unbrauchbar wie
  // jeder andere unbekannte Zahler — fällt zurück auf die Kasse.
  const validPayer = (payer) => payer === POT || knownPerson.has(payer) || (isCashPayer(payer) && knownPerson.has(cashPayerPerson(payer)));
  // Beträge sind ganzzahlige Cent; alles andere würde sich durch die ganze
  // Rechnung ziehen und dort als NaN wieder auftauchen.
  const usableAmount = (v) => Number.isInteger(v) && v !== 0;
  const rows = (list, extra) =>
    (Array.isArray(list) ? list : []).filter((r) => r && typeof r.id === 'string' && usableAmount(r.amount) && isValidDate(r.date) && extra(r));

  const expenses = rows(data.expenses, () => true).map((e) => ({
    ...e,
    category: CATEGORY_BY_ID[e.category] ? e.category : 'other',
    payer: validPayer(e.payer) ? e.payer : POT,
    // Nur eine echte Marke zählt; alles andere ist eine bezahlte Ausgabe.
    planned: e.planned === true,
    fromPlan: e.fromPlan === true && e.planned !== true,
  }));
  const expenseIds = new Set(expenses.map((e) => e.id));

  // Programmpunkte brauchen keinen Betrag (der steht, wenn überhaupt, an der
  // verknüpften Ausgabe) — deshalb eine eigene, schlankere Prüfung statt der
  // generischen `rows()`, die einen gültigen Betrag voraussetzt.
  const planItems = (Array.isArray(data.planItems) ? data.planItems : [])
    .filter((p) => p && typeof p.id === 'string' && p.id && isValidDate(p.date))
    .map((p) => {
      const category = PLAN_CATEGORY_BY_ID[p.category] ? p.category : 'other';
      const time = /^\d{2}:\d{2}$/.test(p.time) ? p.time : '';
      return {
        ...p,
        title: String(p.title || '').trim() || 'Programmpunkt',
        category,
        // Die Sorte wird gegen die *geprüfte* Kategorie gehalten, nicht gegen
        // die rohe — wie bei der Packliste (siehe dort).
        sub: planSub({ category, sub: p.sub }),
        time,
        // Ohne Anfang keine Dauer, also auch kein Ende.
        endTime: time && /^\d{2}:\d{2}$/.test(p.endTime) ? p.endTime : '',
        location: String(p.location || '').trim(),
        note: String(p.note || '').trim(),
        payer: validPayer(p.payer) ? p.payer : POT,
        done: p.done === true,
        // Zeigt die Verknüpfung ins Leere (Ausgabe fehlt oder kam nicht durch
        // die Prüfung), ist der Programmpunkt eben ohne Kostenpunkt da — besser
        // als eine Kennung, die nirgendwohin führt.
        linkedExpenseId: typeof p.linkedExpenseId === 'string' && expenseIds.has(p.linkedExpenseId) ? p.linkedExpenseId : null,
      };
    });

  // Die Packliste hat weder Datum noch Betrag — von der generischen `rows()`
  // bliebe da nichts übrig. Gebraucht wird nur ein Titel; die drei Merkmale
  // fallen auf ihre Voreinstellung zurück, wenn dort etwas Unbekanntes steht.
  const packItems = (Array.isArray(data.packItems) ? data.packItems : [])
    .filter((p) => p && typeof p.id === 'string' && p.id && String(p.title || '').trim())
    .map((p) => {
      const category = PACK_CATEGORY_BY_ID[p.category] ? p.category : 'other';
      return {
        ...p,
        title: String(p.title).trim(),
        category,
        // Die Sorte wird gegen die *geprüfte* Kategorie gehalten, nicht gegen
        // die rohe: rutscht ein Eintrag beim Einlesen nach „Sonstiges“, darf
        // seine alte Sorte nicht mitrutschen.
        sub: packSub({ category, sub: p.sub }),
        qty: packQty(p),
        status: PACK_STATUS_BY_ID[p.status] ? p.status : 'open',
        bag: PACK_BAG_BY_ID[p.bag] ? p.bag : 'none',
        note: String(p.note || '').trim(),
      };
    });

  // Eine Unterkunft hat wie die Packliste weder Betrag noch einen einzelnen
  // Tag — dafür einen Zeitraum. Ohne Namen oder mit einem Ende vor dem Anfang
  // wäre der Eintrag zu nichts mehr zu gebrauchen, also fliegt er raus statt
  // kaputt weiterzureisen.
  const stays = (Array.isArray(data.stays) ? data.stays : [])
    .filter((s) => s && typeof s.id === 'string' && s.id && String(s.name || '').trim() && isValidDate(s.startDate) && isValidDate(s.endDate) && s.endDate >= s.startDate)
    .map((s) => ({
      ...s,
      name: String(s.name).trim(),
      address: String(s.address || '').trim(),
      note: String(s.note || '').trim(),
    }));

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
    expenses,
    planItems,
    packItems,
    stays,
  };
}

/** Ausgaben als CSV, für Tabellenkalkulationen. */
export function buildCsv({ trip, expenses, contributions, cashOuts = [], planItems = [], packItems = [], stays = [] }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const money = (cents) => (cents / 100).toFixed(2).replace('.', ',');
  const personName = (id) => trip.people.find((p) => p.id === id)?.name || 'Unbekannt';
  // In der Tabelle stehen die Namen, die auch in der App stehen — nicht die
  // internen Kennungen wie `food` oder `pot`. Der Reiseplan hat eigene
  // Kategorien (siehe `PLAN_CATEGORY_BY_ID`), deshalb ein eigenes Nachschlagen.
  const categoryLabel = (id) => (CATEGORY_BY_ID[id] || CATEGORY_BY_ID.other).label;
  const planCategoryLabel = (id) => (PLAN_CATEGORY_BY_ID[id] || PLAN_CATEGORY_BY_ID.other).label;
  const payerLabel = (payer) => {
    if (payer === POT) return 'Gemeinsame Kasse';
    if (isCashPayer(payer)) return `Bargeld (${personName(cashPayerPerson(payer))})`;
    return personName(payer);
  };
  const lines = [['Art', 'Datum', 'Zeit', 'Betrag', 'Kategorie', 'Bezahlt von', 'Notiz'].map(esc).join(';')];

  for (const c of [...contributions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(['Einzahlung', c.date, '', money(c.amount), '', personName(c.personId), c.note].map(esc).join(';'));
  }
  for (const c of [...cashOuts].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    lines.push(['Bargeld ausgezahlt', c.date, '', money(c.amount), '', personName(c.personId), c.note].map(esc).join(';'));
  }
  for (const e of [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    // Vorgemerktes steht mit eigener Art da — sonst zählte eine Tabelle Geld
    // mit, das noch gar nicht ausgegeben ist.
    lines.push([e.planned === true ? 'Verplant' : 'Ausgabe', e.date, '', money(e.amount), categoryLabel(e.category), payerLabel(e.payer), e.note].map(esc).join(';'));
  }
  // Der Reiseplan steht als eigene Art dabei: ein Programmpunkt ohne
  // Kostenpunkt hat kein Geld, das in dieser Tabelle sonst fehlen würde.
  for (const p of [...planItems].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const linked = p.linkedExpenseId ? expenses.find((e) => e.id === p.linkedExpenseId) : null;
    const zeit = p.time && p.endTime ? `${p.time}–${p.endTime}` : p.time || '';
    const notiz = [p.title, planSubLabel(p), p.location, p.note].filter(Boolean).join(' · ');
    lines.push([
      'Programm', p.date, zeit, linked ? money(linked.amount) : '',
      planCategoryLabel(p.category), linked ? payerLabel(linked.payer) : '', notiz,
    ].map(esc).join(';'));
  }
  // Eine Unterkunft steht mit ihrem Anreisetag in der Datumsspalte — der
  // Zeitraum selbst gehört, wie bei der Packliste die Merkmale, in die Notiz.
  for (const s of [...stays].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
    const zeitraum = s.endDate !== s.startDate ? `bis ${s.endDate}` : '';
    const notiz = [s.name, s.address, zeitraum, s.note].filter(Boolean).join(' · ');
    lines.push(['Unterkunft', s.startDate, '', '', '', '', notiz].map(esc).join(';'));
  }
  // Die Packliste hat in dieser Tabelle keine Spalte für sich: kein Datum,
  // kein Betrag. Sie steht trotzdem drin, weil genau dafür jemand exportiert —
  // eine Liste zum Ausdrucken und Abhaken auf Papier. Stand und Gepäck stehen
  // hinten bei der Notiz, wo sie niemandem eine Geldspalte verstellen.
  for (const p of packItems) {
    const qty = packQty(p);
    const merkmale = [packSubLabel(p), PACK_STATUS_BY_ID[p.status]?.label, PACK_BAG_BY_ID[p.bag]?.short, p.note].filter(Boolean);
    // Die Anzahl steht vor dem Namen, so wie in der App: „4 × Hemd“ liest
    // sich auf Papier wie eine Packliste, „Hemd (4)“ wie eine Inventarnummer.
    const name = qty > 1 ? `${qty} \u00d7 ${p.title}` : p.title;
    lines.push(['Packliste', '', '', '', PACK_CATEGORY_BY_ID[p.category]?.label || 'Sonstiges', '', [name, ...merkmale].join(' \u00b7 ')].map(esc).join(';'));
  }
  // BOM, damit Excel die Umlaute richtig liest.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
