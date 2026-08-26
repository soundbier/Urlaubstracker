/** Zufällige Kennungen — für Dokumente und für Einladungscodes. */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I/O/0/1

function randomBytes(n) {
  const buf = new Uint8Array(n);
  (globalThis.crypto || {}).getRandomValues?.(buf);
  if (!globalThis.crypto?.getRandomValues) {
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

/** Dokument-Kennung, lang genug um nicht erraten zu werden. */
export function newId(len = 20) {
  return [...randomBytes(len)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Einladungscode in gut vorlesbaren Blöcken: `K7M4-QX2P`. */
export function newInviteCode() {
  const s = newId(8);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeInviteCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
