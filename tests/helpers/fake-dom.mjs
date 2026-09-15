/**
 * Ein Dokument, so klein wie es für die Bausteine aus `js/dom.js` gerade
 * reicht: Elemente mit Klassenliste, Kindern, Attributen und Ereignissen.
 *
 * Gedacht für das, was sich an der Oberfläche *verhalten* muss und nicht nur
 * aussehen — ein Knopf, der nach dem Ausblenden nichts mehr auslösen darf,
 * zum Beispiel. Alles, was von echtem Layout abhängt (was verdeckt wen, was
 * ist anzutippen), kann hier nicht geprüft werden und gehört ins Stylesheet
 * und in eine Prüfung darauf.
 */

class FakeNode {
  constructor() {
    this.parentNode = null;
  }

  remove() {
    const siblings = this.parentNode?.childNodes;
    const i = siblings ? siblings.indexOf(this) : -1;
    if (i >= 0) siblings.splice(i, 1);
    this.parentNode = null;
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.data = String(text);
  }

  get textContent() {
    return this.data;
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    // Eigenschaften, die es im Browser an jedem Element gibt: `dom.h` prüft
    // mit `k in el`, ob es eine Eigenschaft setzen darf oder ein Attribut
    // schreiben muss — ohne sie liefe alles über `setAttribute`, und der Test
    // prüfte einen anderen Weg als die App ihn nimmt.
    this.id = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this._class = '';
  }

  get className() {
    return this._class;
  }

  set className(v) {
    this._class = String(v ?? '').trim();
  }

  get classList() {
    const parts = () => this._class.split(/\s+/).filter(Boolean);
    const write = (list) => { this._class = list.join(' '); };
    return {
      contains: (c) => parts().includes(c),
      add: (c) => { if (!parts().includes(c)) write([...parts(), c]); },
      remove: (c) => write(parts().filter((x) => x !== c)),
      toggle: (c, on) => {
        const has = parts().includes(c);
        const next = on === undefined ? !has : Boolean(on);
        if (next) write([...parts().filter((x) => x !== c), c]);
        else write(parts().filter((x) => x !== c));
        return next;
      },
    };
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }

  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  /** Ein Tipp auf dieses Element — mehr Ereignismodell braucht hier nichts. */
  click() {
    for (const fn of [...(this.listeners.get('click') || [])]) fn({ type: 'click', target: this });
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) this.append(new FakeText(v));
  }

  /** Nur die drei Formen, die `dom.$` in diesem Umfeld benutzt. */
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }

  querySelector(selector) {
    for (const child of this.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    for (const child of this.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      if (child.matches(selector)) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
}

/**
 * Hängt `document`, `Node` und Freunde in die Umgebung und gibt das Dokument
 * zurück. Muss vor dem Import des geprüften Moduls laufen — `js/dom.js` greift
 * beim Bauen auf `document` zu.
 */
export function installFakeDom() {
  const document = new FakeElement('html');
  document.body = new FakeElement('body');
  document.append(document.body);
  document.createElement = (tag) => new FakeElement(tag);
  document.createTextNode = (text) => new FakeText(text);
  document.activeElement = null;

  globalThis.Node = FakeNode;
  globalThis.document = document;
  return document;
}
