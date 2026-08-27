/** Winzige DOM-Hilfen. Kein Framework, kein innerHTML mit fremdem Text. */

/**
 * `h('div.card', { onclick }, 'Text', kindElement)`
 * Der Tag darf Klassen im CSS-Stil mitbringen: `button.chip.is-active`.
 */
export function h(spec, props = null, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // nur für eigene Icon-Vorlagen
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function replace(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Wie `h`, aber im SVG-Namensraum: `s('circle', { r: 8 })`. */
export function s(spec, props = null, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElementNS(SVG_NS, tag);
  if (classes.length) el.setAttribute('class', classes.join(' '));

  // Wie bei `h`: ein Element an zweiter Stelle ist ein Kind, keine Attributliste.
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Inline-SVG-Icon aus dem Pfad-Vorrat unten. */
export function icon(name, size = 24) {
  const d = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const path of [].concat(d || [])) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path);
    svg.append(p);
  }
  return svg;
}

const ICONS = {
  sun: ['M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1.1 1.1M16.6 16.6l1.1 1.1M17.7 6.3l-1.1 1.1M7.4 16.6l-1.1 1.1', 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z'],
  list: ['M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  chart: ['M4 19V5M4 19h16', 'M8 16v-4M12 16V8M16 16v-6'],
  gear: ['M5 8h9M18 8h1M10 16h9M5 16h1', 'M16 5.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z', 'M8 13.8a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z'],
  plus: ['M12 5v14M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M6 9.5l6 6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
  trash: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6'],
  cloud: ['M7 18a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.5 3.5 0 0117 18H7z'],
  cloudOff: ['M3 3l18 18', 'M7 18a4 4 0 01-.9-7.9M9.5 6.4A5.5 5.5 0 0117.5 11.5 3.5 3.5 0 0119 17.5', 'M17 18H7'],
  check: ['M5 13l4 4L19 7'],
  copy: ['M9 9h10v10H9z', 'M5 15V5h10'],
  download: ['M12 4v10M8 12l4 4 4-4', 'M5 19h14'],
  upload: ['M12 16V6M8 10l4-4 4 4', 'M5 19h14'],
  wallet: ['M4 8a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z', 'M4 10h16M16 14h.01'],
  people: ['M8 11a3 3 0 100-6 3 3 0 000 6z', 'M2 20a6 6 0 0112 0', 'M16 5.2a3 3 0 010 5.6M17 14.3A6 6 0 0122 20'],
  person: ['M12 11.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z', 'M5 20a7 7 0 0114 0'],
  calendar: ['M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z', 'M8 3v4M16 3v4M4 11h16'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5M12 8h.01'],

  // Kategorien. Bewusst dieselbe Strichstärke wie der Rest — Emoji sähen auf
  // jedem Gerät anders aus und passen farblich zu nichts.
  food: ['M7.5 3v5a2.2 2.2 0 004.4 0V3', 'M9.7 10.2V21', 'M16.8 3c1.3 2.1 1.9 4.1 1.9 6.1 0 1.5-.7 2.4-1.9 2.4s-1.9-.9-1.9-2.4c0-2 .6-4 1.9-6.1z', 'M16.8 11.5V21'],
  transport: ['M4 16v-3.6l1.8-4.1A2 2 0 017.6 7h8.8a2 2 0 011.8 1.3l1.8 4.1V16', 'M3 12.4h18', 'M7.5 15.4a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2z', 'M16.5 15.4a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2z'],
  // Ein Bett, kein Zelt: die Zeltform ist bei 16 px von einem Warndreieck
  // nicht zu unterscheiden.
  stay: ['M3.2 19.5V7.5', 'M3.2 13.5h13.1a4.5 4.5 0 014.5 4.5v1.5', 'M8 12.4a2.1 2.1 0 100-4.2 2.1 2.1 0 000 4.2z'],
  activity: ['M4 8.5A1.5 1.5 0 015.5 7h13A1.5 1.5 0 0120 8.5v1.6a2 2 0 000 3.8v1.6A1.5 1.5 0 0118.5 17h-13A1.5 1.5 0 014 15.5v-1.6a2 2 0 000-3.8V8.5z', 'M14 8.6v1.3M14 11.3v1.4M14 14.1v1.3'],
  shopping: ['M5.2 8h13.6l-1.1 12.5H6.3L5.2 8z', 'M9 8V6a3 3 0 016 0v2'],
  other: ['M6 12h.01M12 12h.01M18 12h.01'],
};
