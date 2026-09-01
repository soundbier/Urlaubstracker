/**
 * Zufällige Kennungen für Dokumente.
 *
 * Die Kennung eines Trips steht hier nicht mehr drin: die rechnet `join.js` aus
 * dem Namen der Kasse aus, damit ein fremdes Gerät sie überhaupt finden kann.
 */

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
