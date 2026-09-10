/**
 * Fahrzeiten zwischen hinterlegten Adressen — über die TomTom Geocoding- und
 * Routing-API.
 *
 * Zwei Aufrufe pro Strecke: eine Adresse ist Freitext, die Routing-API
 * braucht aber Koordinaten. Also erst `geocode` (Adresse → `lat`/`lon`),
 * dann `calculateRoute` (zwei Koordinaten → Fahrzeit). `segmentTravelTime`
 * fasst beides zu einem Aufruf zusammen — das, was `views/today.js` beim
 * Antippen des Knopfs tatsächlich braucht.
 *
 * Wichtig: das hier läuft nie von selbst. Aufgerufen wird es ausschließlich
 * auf Anfrage (ein Knopf auf „Heute“), nie beim Rendern und nie in einem
 * Intervall — Adressen ändern sich selten, und der kostenlose Rahmen bei
 * TomTom ist überschaubar. Einzige Ausnahme ist der Geokodierungs-Cache
 * unten: eine Adresse liefert immer dieselben Koordinaten, ein erneutes
 * Nachfragen bei TomTom wäre reine Verschwendung. Die Fahrzeit selbst wird
 * nie aus einem Cache bedient — Verkehr ändert sich, und ein erneuter
 * Knopfdruck soll auch wirklich eine neue Zahl liefern.
 */

const GEOCODE_URL = 'https://api.tomtom.com/search/2/geocode';
const ROUTE_URL = 'https://api.tomtom.com/routing/1/calculateRoute';

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

/** Adresse → Koordinaten, für die Dauer der Sitzung gemerkt (siehe oben). */
const geocodeCache = new Map();

async function geocode(address, apiKey) {
  const key = address.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = `${GEOCODE_URL}/${encodeURIComponent(address)}.json?key=${encodeURIComponent(apiKey)}&limit=1`;
  const res = await withTimeout(fetch(url), 6000, 'Die Adresssuche dauert zu lange.');
  if (!res.ok) throw new Error(res.status === 403 ? 'TomTom-Key ungültig oder für diese Adresse gesperrt.' : `Adresssuche fehlgeschlagen (${res.status}).`);
  const data = await res.json();
  const hit = data.results?.[0]?.position;
  const point = hit ? { lat: hit.lat, lon: hit.lon } : null;
  geocodeCache.set(key, point);
  return point;
}

async function routeBetween(from, to, apiKey) {
  const url = `${ROUTE_URL}/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(apiKey)}&travelMode=car`;
  const res = await withTimeout(fetch(url), 8000, 'Die Routenberechnung dauert zu lange.');
  if (!res.ok) throw new Error(res.status === 403 ? 'TomTom-Key ungültig oder für Routing gesperrt.' : `Routenberechnung fehlgeschlagen (${res.status}).`);
  const data = await res.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary) throw new Error('Keine Route gefunden.');
  return { seconds: summary.travelTimeInSeconds, meters: summary.lengthInMeters };
}

/**
 * Die Fahrzeit zwischen zwei Adressen — geokodiert beide (mit Cache, siehe
 * oben) und berechnet dann frisch die Route. Wirft, statt `null`
 * zurückzugeben, wenn irgendwo etwas fehlschlägt: `views/today.js` fängt das
 * pro Strecke ab, damit eine nicht auffindbare Adresse nicht die ganze Kette
 * abbrechen lässt.
 */
export async function segmentTravelTime(fromAddress, toAddress, apiKey) {
  const [from, to] = await Promise.all([geocode(fromAddress, apiKey), geocode(toAddress, apiKey)]);
  if (!from) throw new Error(`Adresse nicht gefunden: „${fromAddress}“`);
  if (!to) throw new Error(`Adresse nicht gefunden: „${toAddress}“`);
  return routeBetween(from, to, apiKey);
}

/**
 * Welche benachbarten Stationen des Tages eine Fahrzeit bekommen können.
 *
 * Reihenfolge: zuerst die Unterkunft der Nacht davor (falls hinterlegt und
 * mit Adresse — siehe `calc.stayForDate`), dann die Programmpunkte in ihrer
 * Anzeige-Reihenfolge (siehe `calc.planItemsOnDay`). Eine Strecke entsteht
 * nur zwischen zwei *unmittelbar* benachbarten Stationen, die *beide* eine
 * Adresse haben — fehlt sie bei einer dazwischen, bricht die Kette dort
 * bewusst ab, statt stillschweigend über die Lücke hinwegzurechnen: sonst
 * stünde am Ende eine Fahrzeit, die tut, als gäbe es den Zwischenstopp nicht.
 *
 * Reine Funktion, kein Netzzugriff — das macht sie für `views/today.js`
 * testbar und wiederverwendbar, ohne dass jeder Aufruf gleich TomTom fragt.
 */
export function travelPairs(dayItems, stay) {
  const pairs = [];
  let prev = stay?.address?.trim()
    ? { key: `stay:${stay.id}`, address: stay.address.trim(), isStay: true }
    : null;

  for (const item of dayItems) {
    const address = (item.location || '').trim();
    const curr = address ? { key: `item:${item.id}`, address } : null;
    if (prev && curr) {
      pairs.push({
        key: `${prev.key}>${curr.key}`,
        fromAddress: prev.address,
        toAddress: curr.address,
        fromIsStay: !!prev.isStay,
      });
    }
    prev = curr;
  }
  return pairs;
}
