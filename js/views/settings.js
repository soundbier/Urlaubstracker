/** Einstellungen: Urlaub, Personen, gemeinsame Nutzung, Daten. */
import { h, icon } from '../dom.js';
import { openSheet, confirmSheet, toast } from '../ui/sheet.js';
import { sectionTitle } from '../ui/parts.js';
import { getPrefs, setTheme, resolveTheme, parseFirebaseConfig, validateFirebaseConfig } from '../prefs.js';
import { buildInviteLink, readInviteFromLocation, buildExport, buildCsv, parseImport } from '../link.js';
import { daysInclusive, isValidDate } from '../calc.js';
import { days, fullDate, plural } from '../format.js';
import * as store from '../store.js';

const CURRENCIES = [
  ['EUR', 'Euro (€)'], ['CHF', 'Schweizer Franken'], ['USD', 'US-Dollar ($)'],
  ['GBP', 'Britisches Pfund (£)'], ['SEK', 'Schwedische Krone'], ['DKK', 'Dänische Krone'],
  ['NOK', 'Norwegische Krone'], ['PLN', 'Złoty'], ['CZK', 'Tschechische Krone'],
  ['HRK', 'Kuna'], ['TRY', 'Türkische Lira'], ['THB', 'Thai-Baht'],
];

export function renderSettings(state, actions) {
  const { sync } = state;

  return h('div.view',
    tripSection(state),
    peopleSection(state),
    appearanceSection(actions),
    syncSection(state),
    dataSection(state),
    h('section.section',
      sectionTitle('Über'),
      h('div.card.card--plain',
        h('p.muted', 'Urlaubstracker — eine gemeinsame Urlaubskasse für zwei. Läuft auch ohne Netz; Eingaben werden nachgereicht, sobald wieder Empfang da ist.'),
        h('p.muted.small', `Version ${document.documentElement.dataset.version || '1.0.0'} · Modus: ${sync.mode === 'cloud' ? 'geteilt über Firestore' : 'nur auf diesem Gerät'}`),
      ),
    ),
  );
}

// ------------------------------------------------------------------- Urlaub

function tripSection(state) {
  const { trip } = state;
  const save = (patch) => store.updateTrip(patch).catch((e) => toast(e.message, { type: 'error' }));

  const start = h('input.field__input', { type: 'date', value: trip.startDate, onchange: (e) => {
    const v = e.target.value;
    if (!isValidDate(v)) return;
    save({ startDate: v, endDate: v > trip.endDate ? v : trip.endDate });
  } });
  const end = h('input.field__input', { type: 'date', value: trip.endDate, min: trip.startDate, onchange: (e) => {
    const v = e.target.value;
    if (!isValidDate(v)) return;
    if (v < trip.startDate) { toast('Das Ende liegt vor dem Anfang.', { type: 'error' }); e.target.value = trip.endDate; return; }
    save({ endDate: v });
  } });

  return h('section.section',
    sectionTitle('Der Urlaub'),
    h('div.card.card--plain',
      h('label.field', h('span.field__label', 'Name'),
        h('input.field__input', { type: 'text', value: trip.name, maxlength: 60, onchange: (e) => save({ name: e.target.value.trim() || 'Unser Urlaub' }) })),
      h('div.field__pair',
        h('label.field', h('span.field__label', 'Von'), start),
        h('label.field', h('span.field__label', 'Bis'), end),
      ),
      h('p.field__note', `${days(daysInclusive(trip.startDate, trip.endDate))} — ${fullDate(trip.startDate)} bis ${fullDate(trip.endDate)}`),
      h('label.field', h('span.field__label', 'Währung'),
        h('select.field__input', { onchange: (e) => save({ currency: e.target.value }) },
          ...CURRENCIES.map(([code, label]) => h('option', { value: code, selected: trip.currency === code }, label)))),
      h('div.field',
        h('span.field__label', 'Tagesbudget'),
        h('div.segmented',
          modeButton('dynamic', 'Mitwachsend', trip.budgetMode, save),
          modeButton('fixed', 'Fester Satz', trip.budgetMode, save),
        ),
        h('p.field__note', trip.budgetMode === 'fixed'
          ? 'Jeden Tag derselbe Betrag: Gesamtbudget geteilt durch die Urlaubstage. Was ihr an einem Tag mehr ausgebt, seht ihr im Polster.'
          : 'Jeden Morgen neu gerechnet: Restgeld geteilt durch die verbleibenden Tage. Ein teurer Tag verteilt sich dann still auf den Rest.'),
      ),
    ),
  );
}

function modeButton(mode, label, current, save) {
  return h('button.segmented__btn', { type: 'button', class: current === mode ? 'is-active' : '', onclick: () => save({ budgetMode: mode }) }, label);
}

// ----------------------------------------------------------------- Aussehen

const THEMES = [
  ['auto', 'Automatisch'],
  ['light', 'Hell'],
  ['dark', 'Dunkel'],
];

/**
 * Hell oder dunkel. Die App wird abends am Tisch aufgemacht, wenn abgerechnet
 * wird, wer heute was bezahlt hat — und dann leuchtet ein weißer Schirm dem
 * ganzen Tisch ins Gesicht.
 *
 * Die Wahl gilt nur für dieses Gerät und wandert deshalb nicht in den Trip:
 * sonst würde das eine Handy dem anderen die Helligkeit umstellen.
 */
function appearanceSection(actions) {
  const current = getPrefs().theme || 'auto';

  return h('section.section',
    sectionTitle('Aussehen'),
    h('div.card.card--plain',
      h('div.field',
        h('span.field__label', 'Farben'),
        h('div.segmented.segmented--3',
          ...THEMES.map(([id, label]) =>
            h('button.segmented__btn', {
              type: 'button',
              class: current === id ? 'is-active' : '',
              onclick: () => { setTheme(id); actions.rerender(); },
            }, label),
          ),
        ),
        h('p.field__note', current === 'auto'
          ? `Folgt dem Handy — gerade ${resolveTheme('auto') === 'dark' ? 'dunkel' : 'hell'}.`
          : 'Bleibt so, egal was das Handy sonst macht.'),
      ),
    ),
  );
}

// ------------------------------------------------------------------ Personen

function peopleSection(state) {
  const { trip, myPersonId } = state;
  const save = (people) => store.updateTrip({ people }).catch((e) => toast(e.message, { type: 'error' }));

  const rename = (id, name) => save(trip.people.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));

  const shareControl = trip.people.length === 2 ? twoWaySplit(trip, save) : null;

  return h('section.section',
    sectionTitle('Wer seid ihr?'),
    h('div.card.card--plain',
      ...trip.people.map((p) =>
        h('div.person',
          h('span.dot.dot--lg', { style: { background: p.color } }),
          h('input.field__input.person__name', { type: 'text', value: p.name, maxlength: 30, onchange: (e) => rename(p.id, e.target.value) }),
          h('button.chip', { type: 'button', class: myPersonId === p.id ? 'is-active' : '', onclick: () => store.setMyPerson(p.id) },
            myPersonId === p.id ? [icon('check', 15), 'das bin ich'] : 'das bin ich'),
        ),
      ),
      shareControl,
    ),
  );
}

/** Wie die Gesamtkosten am Ende aufgeteilt werden. */
function twoWaySplit(trip, save) {
  const [a, b] = trip.people;
  const total = (a.share || 1) + (b.share || 1);
  const pctA = Math.round(((a.share || 1) / total) * 100);

  const label = h('p.field__note');
  const setLabel = (v) => { label.textContent = `${a.name} trägt ${v} %, ${b.name} ${100 - v} %.`; };
  setLabel(pctA);

  const slider = h('input.slider', {
    type: 'range', min: 5, max: 95, step: 5, value: pctA,
    oninput: (e) => setLabel(Number(e.target.value)),
    onchange: (e) => {
      const v = Number(e.target.value);
      save([{ ...a, share: v }, { ...b, share: 100 - v }]);
    },
  });

  return h('div.field',
    h('span.field__label', 'Kosten aufteilen'),
    slider,
    label,
    pctA !== 50 ? null : h('p.field__note.muted', 'Standard ist halbe-halbe. Das zählt nur für die Endabrechnung.'),
  );
}

// --------------------------------------------------------------------- Sync

function syncSection(state) {
  const { sync } = state;
  const cloud = sync.mode === 'cloud';
  const invite = store.getInviteInfo();

  const status = cloud
    ? sync.error
      ? { tone: 'over', icon: 'cloudOff', title: 'Synchronisierung stockt', text: sync.error }
      : sync.connected
        ? { tone: 'good', icon: 'cloud', title: 'Verbunden', text: 'Beide Geräte sehen denselben Stand.' }
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
      : { tone: 'muted', icon: 'cloudOff', title: 'Nur auf diesem Gerät', text: `${otherPersonName(state) || 'Das andere Handy'} sieht die Einträge noch nicht. Mit einem Firebase-Projekt teilt ihr euch denselben Trip.` };

  return h('section.section',
    sectionTitle('Gemeinsam nutzen'),
    h('div.card.card--plain',
      h('div.status', { class: `status--${status.tone}` },
        icon(status.icon, 22),
        h('div', h('p.status__title', status.title), h('p.status__text', status.text)),
      ),
      cloud
        ? h('div.stack',
            invite ? h('button.btn.btn--primary', { type: 'button', onclick: () => shareInvite(invite) }, icon('share', 19), 'Einladung teilen') : null,
            h('button.btn.btn--ghost', { type: 'button', onclick: () => rotateCode() }, 'Einladungscode erneuern'),
            h('button.btn.btn--ghost', { type: 'button', onclick: () => disconnect() }, 'Synchronisierung beenden'),
          )
        : h('div.stack',
            h('button.btn.btn--primary', { type: 'button', onclick: () => setupCloud() }, icon('cloud', 19), 'Mit Firebase verbinden'),
            h('button.btn.btn--ghost', { type: 'button', onclick: () => enterInvite() }, 'Einladung eingeben'),
          ),
    ),
  );
}

/** Die andere Person im Trip — für Texte, die sonst raten müssten, wer das ist. */
function otherPersonName({ trip, myPersonId }) {
  const other = (trip.people || []).find((p) => p.id !== myPersonId);
  return myPersonId && other ? other.name : '';
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
      subtitle: 'Diesen Link an das andere Handy schicken.',
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
    text: 'Der Trip bleibt mit allen Einträgen auf diesem Gerät. Neue Einträge sieht das andere Gerät dann aber nicht mehr.',
    confirmLabel: 'Beenden',
    danger: true,
  });
  if (!ok) return;
  await store.disconnectCloud();
  toast('Läuft jetzt nur noch auf diesem Gerät.');
}

/** Firebase-Konfiguration einsammeln und den aktuellen Trip hochladen. */
function setupCloud() {
  return openSheet({
    title: 'Mit Firebase verbinden',
    subtitle: 'Einmalig einrichten — danach seht ihr beide denselben Stand.',
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
          toast('Trip wird hochgeladen …');
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
        h('p.muted.small', 'Diese Angaben sind nicht geheim — geschützt wird der Trip über die Sicherheitsregeln und den Einladungscode.'),
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
        const hash = String(input.value).includes('#') ? String(input.value).slice(String(input.value).indexOf('#')) : '';
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

function dataSection(state) {
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
          state.sync.mode === 'cloud' ? ' — auf beiden Geräten.' : ' auf diesem Gerät.'
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

  return h('section.section',
    sectionTitle('Daten'),
    h('div.card.card--plain',
      h('div.stack',
        h('button.btn.btn--ghost', { type: 'button', onclick: () => download(buildCsv({ trip, expenses, contributions }), `${slug}.csv`, 'text/csv;charset=utf-8') },
          icon('download', 18), 'Als CSV für Excel'),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => download(buildExport({ trip, contributions, expenses }), `${slug}-sicherung.json`, 'application/json') },
          icon('download', 18), 'Sicherungskopie speichern'),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => importFile.click() }, icon('upload', 18), 'Sicherung einspielen'),
        importFile,
        h('button.btn.btn--ghost.btn--danger', { type: 'button', onclick: () => removeTrip(state) }, icon('trash', 18), 'Urlaub löschen'),
      ),
    ),
  );
}

async function removeTrip(state) {
  const cloud = state.sync.mode === 'cloud';
  const ok = await confirmSheet({
    title: 'Urlaub löschen?',
    text: cloud
      ? 'Der Trip wird für beide Geräte gelöscht — alle Einzahlungen und Ausgaben sind dann weg. Vorher am besten eine Sicherungskopie speichern.'
      : 'Alle Einzahlungen und Ausgaben auf diesem Gerät werden gelöscht. Vorher am besten eine Sicherungskopie speichern.',
    confirmLabel: 'Endgültig löschen',
    danger: true,
  });
  if (!ok) return;
  await store.deleteTrip();
  toast('Gelöscht.');
}
