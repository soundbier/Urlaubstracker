/**
 * Einstellungen.
 *
 * Gelesen wird hier öfter als geändert: „auf wen läuft das Konto?“, „wie ist
 * geteilt?“, „welche Währung?“. Deshalb ist die Seite eine Liste von Zeilen,
 * die den eingestellten Wert gleich mitzeigt — geöffnet wird nur, was man
 * wirklich umstellen will. Vorher stand hier jedes Formularfeld dauerhaft
 * offen: zwei Bildschirmlängen, durch die man scrollen musste, um zu sehen,
 * was überhaupt eingestellt ist.
 */
import { h, icon } from '../dom.js';
import { openSheet, confirmSheet, toast } from '../ui/sheet.js';
import { installInstructionsSheet } from '../ui/parts.js';
import { getPrefs, setTheme, parseFirebaseConfig, validateFirebaseConfig } from '../prefs.js';
import { buildInviteLink, readInviteFromLocation, buildExport, buildCsv, parseImport } from '../link.js';
import { daysInclusive, isValidDate, allocateByShares, normalizeShares, MAX_PEOPLE, personEntryCount } from '../calc.js';
import { days, fullDate, compactDate, plural } from '../format.js';
import { isInstalled, canPromptInstall, promptInstall } from '../install.js';
import * as store from '../store.js';

const CURRENCIES = [
  ['EUR', 'Euro', '€'], ['CHF', 'Schweizer Franken', 'CHF'], ['USD', 'US-Dollar', '$'],
  ['GBP', 'Britisches Pfund', '£'], ['SEK', 'Schwedische Krone', 'kr'], ['DKK', 'Dänische Krone', 'kr'],
  ['NOK', 'Norwegische Krone', 'kr'], ['PLN', 'Złoty', 'zł'], ['CZK', 'Tschechische Krone', 'Kč'],
  ['HRK', 'Kuna', 'kn'], ['TRY', 'Türkische Lira', '₺'], ['THB', 'Thai-Baht', '฿'],
];

const BUDGET_MODES = [
  ['dynamic', 'Mitwachsend', 'Jeden Morgen neu: Restgeld geteilt durch die verbleibenden Tage. Ein teurer Tag verteilt sich still auf den Rest — ihr müsst nichts aufholen.'],
  ['fixed', 'Fester Satz', 'Jeden Tag derselbe Betrag. Ob ihr vor oder hinter dem Plan liegt, zeigt die Kachel „Polster“.'],
];

const THEMES = [
  ['auto', 'Automatisch', 'Folgt dem Handy.'],
  ['light', 'Hell', null],
  ['dark', 'Dunkel', 'Abends am Tisch leuchtet kein weißer Schirm in die Runde.'],
];

// ------------------------------------------------------------- Bausteine

/** Überschrift plus Karte. Die Karte gibt der Gruppe eine Kante, die Zeilen ihren Takt. */
function group(title, { meta = null, note = null } = {}, ...rows) {
  const body = rows.filter(Boolean);
  if (!body.length) return null;
  return h('section.section',
    h('div.section__head',
      h('h2.section__title', title),
      meta ? h('span.section__meta', meta) : null,
    ),
    h('div.rows', ...body),
    note ? h('p.section__note', note) : null,
  );
}

/**
 * Eine Zeile, die zu etwas führt: links wofür, rechts wie es steht.
 *
 * Der Wert gehört in die Zeile und nicht erst hinter den Tipp — sonst muss man
 * jede Einstellung einzeln öffnen, um zu sehen, was drinsteht.
 */
function navRow(label, { value = '', sub = '', lead = null, onClick } = {}) {
  return h('button.srow', { type: 'button', onclick: onClick },
    lead,
    h('span.srow__main',
      h('span.srow__label', label),
      sub ? h('span.srow__sub', sub) : null,
    ),
    value ? h('span.srow__value', value) : null,
    h('span.srow__chevron', icon('chevron', 18)),
  );
}

/** Eine Zeile, die etwas tut. Kein Pfeil — dahinter kommt keine weitere Seite. */
function actionRow(iconName, label, onClick, { danger = false, sub = '' } = {}) {
  return h('button.srow', { type: 'button', class: danger ? 'srow--danger' : '', onclick: onClick },
    h('span.srow__lead', icon(iconName, 18)),
    h('span.srow__main',
      h('span.srow__label', label),
      sub ? h('span.srow__sub', sub) : null,
    ),
  );
}

/**
 * Auswahl aus wenigen festen Möglichkeiten — Währung, Tagesbudget, Aussehen.
 *
 * Als Liste statt als `<select>`: hier ist Platz für den Satz, der erklärt,
 * was die Wahl bedeutet, und der Haken zeigt ohne Aufklappen, was gilt.
 * Löst mit der gewählten Kennung auf, oder mit `undefined` beim Abbrechen.
 */
function chooseSheet({ title, subtitle, options, current }) {
  return openSheet({
    title,
    subtitle,
    build: (close) =>
      h('div.rows', ...options.map(([id, label, note]) =>
        h('button.srow.srow--option', { type: 'button', class: id === current ? 'is-active' : '', onclick: () => close(id) },
          h('span.srow__main',
            h('span.srow__label', label),
            note ? h('span.srow__sub', note) : null,
          ),
          id === current ? h('span.srow__check', icon('check', 19)) : null,
        ),
      )),
  });
}

const saveTrip = (patch) => store.updateTrip(patch).catch((e) => toast(e.message, { type: 'error' }));

// ------------------------------------------------------------------ Seite

export function renderSettings(state, actions) {
  return h('div.view',
    tripGroup(state),
    peopleGroup(state, actions),
    deviceGroup(actions),
    syncGroup(state),
    dataGroup(state),
    aboutGroup(state),
    // Ganz unten und für sich: was hier steht, ist nicht zurückzuholen.
    h('div.danger',
      h('button.btn.btn--ghost.btn--danger.btn--wide', { type: 'button', onclick: () => removeTrip(state) },
        icon('trash', 18), 'Urlaubskasse löschen'),
    ),
  );
}

// ------------------------------------------------------------------ Kasse

function tripGroup(state) {
  const { trip } = state;
  const total = daysInclusive(trip.startDate, trip.endDate);
  const currency = CURRENCIES.find(([code]) => code === trip.currency);
  const mode = BUDGET_MODES.find(([id]) => id === trip.budgetMode) || BUDGET_MODES[0];

  return group('Die Kasse', {},
    navRow('Name', { value: trip.name, onClick: () => nameSheet(trip) }),
    navRow('Zeitraum', {
      value: `${compactDate(trip.startDate)} – ${compactDate(trip.endDate)}`,
      sub: days(total),
      onClick: () => rangeSheet(trip),
    }),
    navRow('Währung', {
      value: currency ? `${currency[1]} (${currency[2]})` : trip.currency,
      onClick: async () => {
        const pick = await chooseSheet({ title: 'Währung', options: CURRENCIES.map(([c, n, s]) => [c, `${n} (${s})`, null]), current: trip.currency });
        if (pick && pick !== trip.currency) saveTrip({ currency: pick });
      },
    }),
    navRow('Tagesbudget', {
      value: mode[1],
      onClick: async () => {
        const pick = await chooseSheet({
          title: 'Tagesbudget',
          subtitle: 'Wie aus dem Gesamtbudget die Zahl für heute wird.',
          options: BUDGET_MODES,
          current: trip.budgetMode,
        });
        if (pick && pick !== trip.budgetMode) saveTrip({ budgetMode: pick });
      },
    }),
  );
}

function nameSheet(trip) {
  return openSheet({
    title: 'Name der Kasse',
    build: (close) => {
      const input = h('input.field__input', { type: 'text', value: trip.name, maxlength: 60, enterkeyhint: 'done' });
      const save = () => { saveTrip({ name: input.value.trim() || 'Unser Urlaub' }); close(true); };
      return h('form.stack', { onsubmit: (e) => { e.preventDefault(); save(); } },
        input,
        h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Speichern'),
      );
    },
  });
}

function rangeSheet(trip) {
  return openSheet({
    title: 'Zeitraum',
    build: (close) => {
      let start = trip.startDate;
      let end = trip.endDate;
      const note = h('p.field__note');
      const error = h('p.field__error');

      const sync = () => {
        endInput.min = start;
        note.textContent = end >= start
          ? `${days(daysInclusive(start, end))} — ${fullDate(start)} bis ${fullDate(end)}`
          : '';
        error.textContent = end < start ? 'Das Ende liegt vor dem Anfang.' : '';
      };

      const startInput = h('input.field__input', { type: 'date', value: start, onchange: (e) => {
        if (!isValidDate(e.target.value)) return;
        start = e.target.value;
        // Mitziehen statt meckern: wer den Anfang nach hinten schiebt, meint
        // meistens die ganze Reise, nicht einen Zeitraum mit negativer Länge.
        if (end < start) { end = start; endInput.value = end; }
        sync();
      } });
      const endInput = h('input.field__input', { type: 'date', value: end, min: start, onchange: (e) => {
        if (!isValidDate(e.target.value)) return;
        end = e.target.value;
        sync();
      } });
      sync();

      const save = () => {
        if (end < start) return;
        saveTrip({ startDate: start, endDate: end });
        close(true);
      };

      return h('div.stack',
        h('div.field__pair',
          h('label.field', h('span.field__label', 'Von'), startInput),
          h('label.field', h('span.field__label', 'Bis'), endInput),
        ),
        note,
        error,
        h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: save }, 'Speichern'),
      );
    },
  });
}

// ----------------------------------------------------------- Reisegruppe

/**
 * Wer mitfährt und wer an diesem Gerät sitzt.
 *
 * Letzteres ist die wichtigste Angabe der Seite: daran hängt, wem privat
 * bezahlte Ausgaben in der Endabrechnung gutgeschrieben werden. Steht es noch
 * nicht fest, sagt die Gruppe das unter der Liste.
 */
function peopleGroup(state, actions) {
  const { trip, myPersonId } = state;

  return group('Reisegruppe', {
    meta: plural(trip.people.length, 'Person', 'Personen'),
    note: myPersonId
      ? null
      : 'Noch ist nicht gesagt, wer an diesem Gerät sitzt — ohne das landen privat bezahlte Ausgaben in der Abrechnung bei niemandem.',
  },
    ...trip.people.map((p) =>
      navRow(p.name, {
        value: p.id === myPersonId ? 'du' : '',
        lead: h('span.srow__dot', { style: { background: p.color } }),
        onClick: () => personSheet(state, p),
      }),
    ),
    trip.people.length < MAX_PEOPLE
      ? actionRow('plus', 'Person hinzufügen', () => actions.addPerson())
      : null,
    trip.people.length > 1
      ? navRow('Kosten aufteilen', { value: splitSummary(trip), onClick: () => splitSheet(trip) })
      : null,
  );
}

/** „50 / 50“ oder „gleichmäßig“ — was in der Zeile steht, ohne sie zu öffnen. */
function splitSummary(trip) {
  const shares = normalizeShares(trip.people.map((p) => p.share));
  if (shares.every((v) => v === shares[0])) return 'gleichmäßig';
  return allocateByShares(100, shares).map((p) => `${p}`).join(' / ');
}

function personSheet(state, person) {
  const { trip, myPersonId, contributions, expenses } = state;
  const isMe = myPersonId === person.id;
  const entries = personEntryCount(person.id, { contributions, expenses });
  const canRemove = trip.people.length > 1 && !entries;

  return openSheet({
    title: person.name,
    build: (close) => {
      const input = h('input.field__input', { type: 'text', value: person.name, maxlength: 30, enterkeyhint: 'done' });
      const save = () => {
        const name = input.value.trim();
        if (name && name !== person.name) {
          store.updateTrip({ people: trip.people.map((p) => (p.id === person.id ? { ...p, name } : p)) })
            .catch((e) => toast(e.message, { type: 'error' }));
        }
        close(true);
      };

      return h('form.stack', { onsubmit: (e) => { e.preventDefault(); save(); } },
        h('label.field', h('span.field__label', 'Name'), input),
        isMe
          ? h('p.field__note', h('span.srow__check', icon('check', 17)), ' Dieses Gerät gehört zu dieser Person.')
          : h('button.btn.btn--ghost.btn--wide', { type: 'button', onclick: () => { store.setMyPerson(person.id); close(true); } },
              icon('person', 18), 'Das bin ich'),
        h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Speichern'),
        canRemove
          ? h('button.btn.btn--ghost.btn--danger.btn--wide', { type: 'button', onclick: async () => { close(false); await removePerson(state, person); } },
              icon('trash', 18), 'Aus der Gruppe entfernen')
          // Wer schon Geld in der Kasse hat, kann nicht verschwinden — sonst
          // fehlten seine Einträge in der Abrechnung bei niemandem.
          : entries
            ? h('p.field__note', `${plural(entries, 'Eintrag hängt', 'Einträge hängen')} an dieser Person — sie kann deshalb nicht entfernt werden.`)
            : null,
      );
    },
  });
}

async function removePerson(state, person) {
  const ok = await confirmSheet({
    title: `„${person.name}“ entfernen?`,
    text: person.id === state.myPersonId
      ? 'Die Person verschwindet aus der Auswahl und aus der Abrechnung. Danach fragt die App wieder, wer an diesem Gerät sitzt.'
      : 'Die Person verschwindet aus der Auswahl und aus der Abrechnung.',
    confirmLabel: 'Entfernen',
    danger: true,
  });
  if (!ok) return;
  try {
    await store.removePerson(person.id);
    toast(`${person.name} ist raus.`);
  } catch (err) {
    toast(err?.message || 'Ging nicht.', { type: 'error' });
  }
}

/** Wie die Gesamtkosten am Ende aufgeteilt werden. */
function splitSheet(trip) {
  const save = (people) => store.updateTrip({ people }).catch((e) => toast(e.message, { type: 'error' }));
  return openSheet({
    title: 'Kosten aufteilen',
    subtitle: 'Zählt nur für die Endabrechnung, nicht fürs Tagesbudget.',
    build: () => (trip.people.length === 2 ? twoWaySplit(trip, save) : shareSplit(trip, save)),
  });
}

/**
 * Zu zweit ist die Aufteilung ein Schieberegler: eine Zahl, zwei Enden, und
 * man sieht sofort, was die andere Seite bekommt.
 */
function twoWaySplit(trip, save) {
  const [a, b] = trip.people;
  const total = (a.share || 1) + (b.share || 1);
  const pctA = Math.round(((a.share || 1) / total) * 100);

  const label = h('p.field__note');
  const setLabel = (v) => { label.textContent = `${a.name} trägt ${v} %, ${b.name} ${100 - v} %.`; };
  setLabel(pctA);

  return h('div.stack',
    h('input.slider', {
      type: 'range', min: 5, max: 95, step: 5, value: pctA,
      oninput: (e) => setLabel(Number(e.target.value)),
      onchange: (e) => {
        const v = Number(e.target.value);
        save([{ ...a, share: v }, { ...b, share: 100 - v }]);
      },
    }),
    label,
  );
}

/**
 * Ab drei Personen sind es Anteile statt Prozent.
 *
 * Prozentfelder, die zusammen 100 ergeben müssen, sind zu dritt eine
 * Rechenaufgabe: eine Zahl ändern heißt zwei nachziehen. Anteile addieren sich
 * zu dem, was sie eben ergeben — „zwei Anteile“ heißt doppelt so viel wie
 * einer, und die Prozentzahl steht zum Mitlesen daneben.
 */
function shareSplit(trip, save) {
  // Gekürzt, damit hier nie 50 in einem Feld steht, das bis 9 geht: aus dem
  // Regler von vorhin (50/50) können sonst krumme Anteile stehenbleiben.
  const shares = normalizeShares(trip.people.map((p) => p.share));
  // Dieselbe Verteilung wie beim Geld: einzeln gerundet ergäben acht gleiche
  // Anteile achtmal 13 % und in der Summe 104 %.
  const percent = allocateByShares(100, shares);
  const even = shares.every((v) => v === shares[0]);

  const setShare = (i, value) => {
    const next = Math.max(1, Math.min(9, value));
    save(trip.people.map((p, k) => ({ ...p, share: k === i ? next : shares[k] })));
  };

  return h('div.stack',
    h('div.shares', ...trip.people.map((p, i) =>
      h('div.share',
        h('span.dot', { style: { background: p.color } }),
        h('span.share__name', p.name),
        h('span.share__pct', `${percent[i]} %`),
        h('div.stepper',
          h('button.stepper__btn', { type: 'button', 'aria-label': `Anteil von ${p.name} verringern`, disabled: shares[i] <= 1, onclick: () => setShare(i, shares[i] - 1) }, '−'),
          h('span.stepper__value', String(shares[i])),
          h('button.stepper__btn', { type: 'button', 'aria-label': `Anteil von ${p.name} erhöhen`, disabled: shares[i] >= 9, onclick: () => setShare(i, shares[i] + 1) }, '+'),
        ),
      ),
    )),
    even
      ? h('p.field__note', 'Alle tragen gleich viel.')
      : h('button.btn.btn--ghost.btn--wide', { type: 'button', onclick: () => save(trip.people.map((p) => ({ ...p, share: 1 }))) }, 'Wieder gleichmäßig aufteilen'),
  );
}

// ----------------------------------------------------------- Dieses Gerät

/**
 * Was nur hier gilt und nicht in den Trip gehört: sonst würde das eine Handy
 * dem anderen die Helligkeit umstellen.
 */
function deviceGroup(actions) {
  const current = getPrefs().theme || 'auto';
  const label = (THEMES.find(([id]) => id === current) || THEMES[0])[1];

  return group('Dieses Gerät', {},
    navRow('Aussehen', {
      value: label,
      onClick: async () => {
        const pick = await chooseSheet({ title: 'Aussehen', options: THEMES, current });
        if (pick && pick !== current) { setTheme(pick); actions.rerender(); }
      },
    }),
    // Läuft die Seite schon im eigenständigen Fenster, ist installiert längst
    // passiert — dann bräuchte die Zeile niemand mehr.
    isInstalled() ? null : navRow('Als App installieren', {
      sub: 'Eigenes Symbol, kein Adressfeld, läuft auch offline.',
      onClick: async () => {
        // Wo der Browser einen eigenen Dialog anbietet (Chrome/Edge auf
        // Android und am Desktop), reicht ein Tipp. Sonst — allen voran
        // Safari auf iOS — bleibt nur die Anleitung von Hand.
        if (canPromptInstall()) await promptInstall();
        else installInstructionsSheet();
      },
    }),
  );
}

// --------------------------------------------------------------------- Sync

function syncGroup(state) {
  const { sync } = state;
  const cloud = sync.mode === 'cloud';
  const invite = store.getInviteInfo();

  const status = cloud
    ? sync.error
      ? { tone: 'over', icon: 'cloudOff', title: 'Synchronisierung stockt', text: sync.error }
      : sync.connected
        ? { tone: 'good', icon: 'cloud', title: 'Verbunden', text: 'Alle Geräte der Gruppe sehen denselben Stand.' }
        : {
            tone: 'warn',
            icon: 'cloudOff',
            title: sync.online ? 'Verbinde…' : 'Offline',
            text: sync.pending
              ? `${plural(sync.pending, 'Eintrag wartet', 'Einträge warten')} auf die Übertragung. Sie gehen nicht verloren.`
              : 'Eingaben werden gespeichert und übertragen, sobald wieder Netz da ist.',
          }
    : sync.error
      ? { tone: 'over', icon: 'cloudOff', title: 'Nichts wird gespeichert', text: sync.error }
      : { tone: 'muted', icon: 'cloudOff', title: 'Nur auf diesem Gerät', text: `${otherNames(state) || 'Die anderen'} sehen die Einträge noch nicht. Mit einem Firebase-Projekt teilt ihr euch denselben Stand.` };

  return h('section.section',
    h('div.section__head', h('h2.section__title', 'Gemeinsam nutzen')),
    h('div.status', { class: `status--${status.tone}` },
      icon(status.icon, 22),
      h('div', h('p.status__title', status.title), h('p.status__text', status.text)),
    ),
    cloud
      ? h('div.rows',
          invite ? actionRow('share', 'Einladung teilen', () => shareInvite(invite), { sub: 'Der Link ist der Schlüssel zur Kasse — privater Chat, keine offene Gruppe.' }) : null,
          actionRow('repeat', 'Einladungscode erneuern', () => rotateCode()),
          actionRow('cloudOff', 'Synchronisierung beenden', () => disconnect()),
        )
      : h('div.rows',
          actionRow('cloud', 'Mit Firebase verbinden', () => setupCloud()),
          actionRow('share', 'Einladung eingeben', () => enterInvite()),
        ),
  );
}

/**
 * Die anderen in der Gruppe, als lesbare Aufzählung — für Texte, die sonst
 * raten müssten, wen sie meinen. Ohne eigene Person (noch nicht gesagt, wer
 * hier sitzt) bleibt es leer, dann steht im Text die allgemeine Fassung.
 */
function otherNames({ trip, myPersonId }) {
  const others = (trip.people || []).filter((p) => p.id !== myPersonId).map((p) => p.name);
  if (!myPersonId || !others.length) return '';
  if (others.length === 1) return others[0];
  if (others.length > 3) return `${others.length} weitere Personen`;
  return `${others.slice(0, -1).join(', ')} und ${others.at(-1)}`;
}

async function shareInvite(invite) {
  const url = buildInviteLink(invite);
  const text = `Unsere Urlaubskasse „${invite.tripName}“ — mit diesem Link kommst du rein:`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Urlaubstracker', text, url });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Einladungslink kopiert.', { type: 'success' });
  } catch {
    openSheet({
      title: 'Einladungslink',
      subtitle: 'Diesen Link an die anderen schicken.',
      build: () => h('div.stack', h('textarea.field__input.field__input--code', { readonly: true, rows: 5, value: url, onclick: (e) => e.target.select() })),
    });
  }
}

async function rotateCode() {
  const ok = await confirmSheet({
    title: 'Code erneuern?',
    text: 'Alte Einladungslinks funktionieren danach nicht mehr. Wer schon beigetreten ist, bleibt drin.',
    confirmLabel: 'Erneuern',
  });
  if (!ok) return;
  await store.rotateInviteCode();
  toast('Neuer Einladungscode erstellt.', { type: 'success' });
}

async function disconnect() {
  const ok = await confirmSheet({
    title: 'Synchronisierung beenden?',
    text: 'Die Kasse bleibt mit allen Einträgen auf diesem Gerät. Neue Einträge sehen die anderen Geräte dann aber nicht mehr.',
    confirmLabel: 'Beenden',
    danger: true,
  });
  if (!ok) return;
  await store.disconnectCloud();
  toast('Läuft jetzt nur noch auf diesem Gerät.');
}

/** Firebase-Konfiguration einsammeln und die aktuelle Kasse hochladen. */
function setupCloud() {
  return openSheet({
    title: 'Mit Firebase verbinden',
    subtitle: 'Einmalig einrichten — danach seht ihr alle denselben Stand.',
    fullHeight: true,
    build: (close) => {
      const input = h('textarea.field__input.field__input--code', {
        rows: 8, spellcheck: false, autocapitalize: 'off',
        placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  appId: "…"\n};',
      });
      const error = h('p.field__error');

      const go = async () => {
        const cfg = parseFirebaseConfig(input.value);
        const problem = validateFirebaseConfig(cfg);
        if (problem) { error.textContent = problem; return; }
        error.textContent = '';
        try {
          toast('Kasse wird hochgeladen …');
          await store.connectCloud(cfg);
          close(true);
          toast('Verbunden. Jetzt die Einladung teilen.', { type: 'success' });
        } catch (err) {
          error.textContent = err?.message || String(err);
        }
      };

      return h('div.stack',
        h('ol.steps',
          h('li', 'In der ', h('strong', 'Firebase-Konsole'), ' ein kostenloses Projekt anlegen.'),
          h('li', 'Dort ', h('strong', 'Firestore Database'), ' erstellen und ', h('strong', 'Authentication → Anonymous'), ' aktivieren.'),
          h('li', 'Die Regeln aus ', h('code', 'firestore.rules'), ' veröffentlichen.'),
          h('li', 'Unter Projekteinstellungen eine ', h('strong', 'Web-App'), ' hinzufügen und den Konfigurationsblock hier einfügen.'),
        ),
        h('label.field', h('span.field__label', 'Firebase-Konfiguration'), input),
        error,
        h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: go }, icon('cloud', 19), 'Verbinden und hochladen'),
        h('p.muted.small', 'Diese Angaben sind nicht geheim — geschützt wird die Kasse über die Sicherheitsregeln und den Einladungscode.'),
      );
    },
  });
}

/** Einer Einladung folgen, wenn der Link nicht direkt geöffnet werden konnte. */
function enterInvite() {
  return openSheet({
    title: 'Einladung eingeben',
    subtitle: 'Den Link einfügen, den du bekommen hast.',
    build: (close) => {
      const input = h('textarea.field__input.field__input--code', { rows: 4, spellcheck: false, placeholder: 'https://…#einladung=…' });
      const error = h('p.field__error');
      const go = async () => {
        const raw = String(input.value);
        const hash = raw.includes('#') ? raw.slice(raw.indexOf('#')) : '';
        const invite = readInviteFromLocation(hash);
        if (!invite) { error.textContent = 'Dieser Link enthält keine Einladung.'; return; }
        try {
          await store.joinTrip(invite);
          close(true);
          toast('Du bist dabei.', { type: 'success' });
        } catch (err) {
          error.textContent = err?.message || String(err);
        }
      };
      return h('div.stack',
        h('label.field', h('span.field__label', 'Einladungslink'), input),
        error,
        h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: go }, 'Beitreten'),
      );
    },
  });
}

// -------------------------------------------------------------------- Daten

function dataGroup(state) {
  const { trip, contributions, expenses } = state;

  const download = (content, filename, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const slug = (trip.name || 'urlaub').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'urlaub';

  const importFile = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = parseImport(await file.text());
      const ok = await confirmSheet({
        title: 'Sicherung einspielen?',
        text: `„${payload.trip.name}“ mit ${plural(payload.expenses.length, 'Ausgabe', 'Ausgaben')} ersetzt den aktuellen Stand${
          state.sync.mode === 'cloud' ? ' — auf allen verbundenen Geräten.' : ' auf diesem Gerät.'
        }`,
        confirmLabel: 'Einspielen',
        danger: true,
      });
      if (!ok) return;
      await store.importData(payload);
      toast('Sicherung eingespielt.', { type: 'success' });
    } catch (err) {
      toast(err?.message || 'Datei konnte nicht gelesen werden.', { type: 'error' });
    }
  } });

  return group('Daten', {},
    actionRow('download', 'Als CSV für Excel', () => download(buildCsv({ trip, expenses, contributions }), `${slug}.csv`, 'text/csv;charset=utf-8')),
    actionRow('download', 'Sicherungskopie speichern', () => download(buildExport({ trip, contributions, expenses }), `${slug}-sicherung.json`, 'application/json')),
    actionRow('upload', 'Sicherung einspielen', () => importFile.click()),
    importFile,
  );
}

async function removeTrip(state) {
  const cloud = state.sync.mode === 'cloud';
  const ok = await confirmSheet({
    title: 'Urlaubskasse löschen?',
    text: cloud
      ? 'Die Kasse wird für alle Geräte gelöscht — alle Einzahlungen und Ausgaben sind dann weg. Vorher am besten eine Sicherungskopie speichern.'
      : 'Alle Einzahlungen und Ausgaben auf diesem Gerät werden gelöscht. Vorher am besten eine Sicherungskopie speichern.',
    confirmLabel: 'Endgültig löschen',
    danger: true,
  });
  if (!ok) return;
  await store.deleteTrip();
  toast('Gelöscht.');
}

// --------------------------------------------------------------------- Über

function aboutGroup(state) {
  return h('section.section.about',
    h('p.muted.small', `Urlaubstracker ${document.documentElement.dataset.version || ''} · ${
      state.sync.mode === 'cloud' ? 'geteilt über Firestore' : 'nur auf diesem Gerät'
    }`),
    h('p.muted.small', 'Läuft auch ohne Netz; Eingaben werden nachgereicht, sobald wieder Empfang da ist.'),
  );
}
