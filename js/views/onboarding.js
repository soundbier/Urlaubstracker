/** Erster Start: Urlaubskasse anlegen — oder einer Einladung folgen. */
import { h, icon } from '../dom.js';
import { toast } from '../ui/sheet.js';
import { installInstructionsSheet } from '../ui/parts.js';
import { joinSheet, plainInput } from '../ui/join-sheet.js';
import { checkJoinName, checkPassword, suggestPassword } from '../join.js';
import { todayISO, addDays, daysInclusive, isValidDate, MAX_PEOPLE, PERSON_COLORS } from '../calc.js';
import { days, fullDate } from '../format.js';
import { isInstalled, canPromptInstall, promptInstall } from '../install.js';
import * as store from '../store.js';

export function renderOnboarding(state) {
  return state.invite ? inviteScreen(state) : createScreen();
}

function inviteScreen(state) {
  const { invite, trip } = state;
  const error = h('p.field__error');
  const button = h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: join }, 'Beitreten');

  async function join() {
    button.disabled = true;
    error.textContent = '';
    try {
      await store.joinTrip(invite);
      toast('Du bist dabei.', { type: 'success' });
    } catch (err) {
      error.textContent = err?.message || String(err);
      button.disabled = false;
    }
  }

  return h('div.view.view--center',
    h('div.welcome',
      h('div.welcome__mark', '€'),
      h('h1.welcome__title', 'Du bist eingeladen'),
      h('p.welcome__text', invite.tripName ? h('span', 'Zur gemeinsamen Urlaubskasse ', h('strong', `„${invite.tripName}“`), '.') : 'Zu einer gemeinsamen Urlaubskasse.'),
      h('p.welcome__text.small', 'Danach seht ihr denselben Stand: Einzahlungen, Ausgaben und das Tagesbudget.'),
      trip ? h('p.field__note', `Wenn du beitrittst, wird „${trip.name}“ auf diesem Gerät durch die geteilte Kasse ersetzt. Gelöscht wird dabei nichts.`) : null,
      button,
      error,
      h('button.btn.btn--ghost', { type: 'button', onclick: () => store.dismissInvite() },
        trip ? `Zurück zu „${trip.name}“` : 'Stattdessen eigene Kasse anlegen'),
      // Dieser Link ist gerade aus einem Chat im Browser gelandet — das
      // Betriebssystem entscheidet, welche App einen Link bekommt, nicht
      // diese Seite. Der einzige Hebel von hier aus: gleich zur Installation
      // einladen, dann liegt beim nächsten Mal ein Symbol auf dem
      // Startbildschirm statt eines Browser-Tabs.
      isInstalled() ? null : h('button.btn.btn--ghost.btn--small', {
        type: 'button',
        onclick: async () => { if (canPromptInstall()) await promptInstall(); else installInstructionsSheet(); },
      }, icon('download', 16), 'Als App installieren'),
    ),
  );
}

/**
 * Der erste Bildschirm überhaupt — und der einzige, an dem noch nichts erklärt
 * ist. Deshalb steht hier nur, was die App wirklich braucht: wie der Urlaub
 * heißt, wie man hereinkommt, wie lange er dauert, und wer mitfährt.
 *
 * Name und Passwort stehen ganz oben zusammen, weil sie zusammengehören: sie
 * sind der Schlüssel zur Kasse. Wer die beiden kennt, ist dabei — mehr braucht
 * niemand weiterzugeben, keinen Link, keine Kennung.
 *
 * Der erste Name ist immer die Person am Gerät. Vorher stand darunter noch die
 * Frage „Wer sitzt an diesem Handy?“ mit den Antworten „Die erste Person“ und
 * „Die zweite Person“ — eine Frage, die man sich zweimal durchlesen musste, um
 * sie zu verstehen. Jetzt beantwortet die Reihenfolge sie: das Feld mit „Du“
 * daneben bist du, alles darunter sind die anderen.
 */
function createScreen() {
  const today = todayISO();
  const values = {
    name: '',
    password: '',
    startDate: today,
    endDate: addDays(today, 13),
    currency: 'EUR',
    budgetMode: 'dynamic',
    // Zwei Zeilen zum Start: die gemeinsame Kasse lohnt sich ab der zweiten
    // Person. Wer allein reist, lässt die zweite einfach leer.
    peopleNames: ['', ''],
  };

  const rangeNote = h('p.field__note');
  const updateNote = () => {
    rangeNote.textContent = isValidDate(values.startDate) && isValidDate(values.endDate) && values.endDate >= values.startDate
      ? `${days(daysInclusive(values.startDate, values.endDate))} — ${fullDate(values.startDate)} bis ${fullDate(values.endDate)}`
      : 'Das Ende muss nach dem Anfang liegen.';
  };
  updateNote();

  const startInput = h('input.field__input', { type: 'date', value: values.startDate, onchange: (e) => {
    values.startDate = e.target.value;
    if (values.endDate < values.startDate) { values.endDate = values.startDate; endInput.value = values.endDate; }
    endInput.min = values.startDate;
    updateNote();
  } });
  const endInput = h('input.field__input', { type: 'date', value: values.endDate, min: values.startDate, onchange: (e) => {
    values.endDate = e.target.value;
    updateNote();
  } });

  const error = h('p.field__error');
  const peopleList = h('div.people');
  const addButton = h('button.btn.btn--ghost.btn--small.people__add', { type: 'button', onclick: () => addPerson() },
    icon('plus', 16), 'Weitere Person');

  // Die Zeilen werden neu gebaut statt einzeln nachgeführt: bei höchstens acht
  // Feldern ist das billiger als Buchführung darüber, welches Feld wo steht.
  // Der Fokus wandert deshalb bewusst mit, wenn eine Zeile dazukommt.
  function renderPeople(focusIndex = -1) {
    peopleList.replaceChildren(...values.peopleNames.map((name, i) => personRow(name, i)));
    addButton.hidden = values.peopleNames.length >= MAX_PEOPLE;
    if (focusIndex >= 0) peopleList.children[focusIndex]?.querySelector('input')?.focus();
  }

  function personRow(name, i) {
    const input = h('input.field__input.people__name', {
      type: 'text',
      value: name,
      maxlength: 30,
      autocomplete: i === 0 ? 'given-name' : 'off',
      placeholder: i === 0 ? 'Dein Name' : 'Name',
      enterkeyhint: 'next',
      oninput: (e) => { values.peopleNames[i] = e.target.value; },
    });

    return h('div.people__row',
      h('span.dot.dot--lg', { style: { background: PERSON_COLORS[i % PERSON_COLORS.length] } }),
      input,
      i === 0
        ? h('span.people__you', 'Du')
        : h('button.icon-btn.people__remove', {
            type: 'button',
            title: 'Zeile entfernen',
            'aria-label': `${name.trim() || `Person ${i + 1}`} entfernen`,
            onclick: () => { values.peopleNames.splice(i, 1); renderPeople(); },
          }, icon('close', 18)),
    );
  }

  function addPerson() {
    if (values.peopleNames.length >= MAX_PEOPLE) return;
    values.peopleNames.push('');
    renderPeople(values.peopleNames.length - 1);
  }

  renderPeople();

  const submit = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Los geht’s');

  const nameInput = plainInput({
    value: values.name, maxlength: 60, placeholder: 'z. B. Roadtrip Süd 2026', enterkeyhint: 'next',
    oninput: (e) => { values.name = e.target.value; },
  });
  const passwordInput = plainInput({
    value: values.password, maxlength: 60, placeholder: 'Passwort ausdenken', enterkeyhint: 'next',
    oninput: (e) => { values.password = e.target.value; },
  });
  // Ein Vorschlag statt eines leeren Felds: zwei Wörter und eine Zahl lassen
  // sich vorlesen, „Sommer1“ nicht weitergeben, ohne rot zu werden.
  const suggest = h('button.btn.btn--ghost.btn--small.field__inline', {
    type: 'button',
    onclick: () => { values.password = suggestPassword(); passwordInput.value = values.password; passwordInput.focus(); },
  }, icon('repeat', 16), 'Vorschlag');

  const onSubmit = async (e) => {
    e.preventDefault();
    const keyProblem = checkJoinName(values.name) || checkPassword(values.password);
    if (keyProblem) {
      error.textContent = keyProblem;
      (checkJoinName(values.name) ? nameInput : passwordInput).focus();
      return;
    }
    if (!isValidDate(values.startDate) || !isValidDate(values.endDate) || values.endDate < values.startDate) {
      error.textContent = 'Bitte einen gültigen Zeitraum wählen.';
      return;
    }

    const names = values.peopleNames.map((n) => n.trim());
    if (!names[0]) {
      // Ohne den eigenen Namen weiß die App nicht, wem privat bezahlte
      // Ausgaben gehören — und die Endabrechnung stimmt nicht mehr.
      error.textContent = 'Bitte deinen Namen eintragen.';
      peopleList.querySelector('input')?.focus();
      return;
    }
    // Leere Zeilen sind kein Fehler, sondern eine nicht genutzte Zeile.
    const people = names.filter(Boolean);
    const doppelt = people.find((n, i) => people.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i);
    if (doppelt) {
      error.textContent = `„${doppelt}“ steht zweimal da — in der Abrechnung wäre dann nicht klar, wer gemeint ist.`;
      return;
    }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = shared ? 'Lege an …' : 'Los geht’s';
    try {
      // Der erste Name ist die Person an diesem Gerät.
      const result = await store.createTrip({ ...values, peopleNames: people, myIndex: 0 });
      // Die Kasse steht — nur eben nicht dort, wo sie stehen sollte. Das gehört
      // gesagt, sonst wundert sich später jemand, warum niemand etwas sieht.
      if (result?.warning) toast(result.warning, { type: 'error', duration: 7000 });
    } catch (err) {
      error.textContent = err?.message || String(err);
      submit.disabled = false;
      submit.textContent = 'Los geht’s';
    }
  };

  // Ob die Kasse gleich geteilt wird, hängt daran, ob dieses Gerät ein
  // Firebase-Projekt kennt. Das entscheidet sich vor dem ersten Aufbau (siehe
  // `store.init`), steht hier also fest.
  const shared = store.cloudReady();

  return h('div.view',
    h('div.welcome.welcome--compact',
      h('div.welcome__mark', '€'),
      h('h1.welcome__title', 'Urlaubskasse anlegen'),
      h('p.welcome__text', 'Tragt ein, was in die gemeinsame Kasse eingezahlt wurde. Die App rechnet daraus das Tagesbudget — und unterwegs hakt ihr kurz ab, was ausgegeben wurde.'),
    ),
    h('form.panel', { onsubmit: onSubmit },
      h('label.field', h('span.field__label', 'Name der Kasse'), nameInput),
      h('div.field',
        h('span.field__label', 'Passwort'),
        passwordInput,
        suggest,
        h('p.field__note', shared
          ? 'Mit diesem Namen und diesem Passwort kommen die anderen in dieselbe Kasse — mehr müsst ihr euch nicht schicken. Beides steht später in den Einstellungen.'
          : 'Merkt euch beides: sobald die Kasse geteilt wird, kommen die anderen genau damit herein.'),
      ),
      h('div.field__pair',
        h('label.field', h('span.field__label', 'Von'), startInput),
        h('label.field', h('span.field__label', 'Bis'), endInput),
      ),
      rangeNote,
      h('div.field',
        h('span.field__label', 'Reisegruppe'),
        peopleList,
        addButton,
        h('p.field__note', 'Das erste Feld bist du — daran erkennt die App später, wer an diesem Gerät sitzt. Namen lassen sich jederzeit ändern.'),
      ),
      error,
      submit,
      h('p.muted.small', shared
        ? 'Die Kasse wird geteilt: Wer den Namen und das Passwort kennt, sieht denselben Stand — auf jedem Gerät, ohne Konto.'
        : 'Läuft erst mal nur auf diesem Gerät. In den Einstellungen könnt ihr die Kasse später mit weiteren Geräten teilen.'),
    ),
    // Wer eingeladen wurde, aber keinen Link hat, sucht genau hier: unter dem
    // Formular, das er nicht ausfüllen will.
    h('div.welcome__foot',
      h('button.btn.btn--ghost.btn--wide', { type: 'button', onclick: () => joinSheet({ name: values.name }) },
        icon('people', 18), 'Einer Kasse beitreten'),
      h('p.muted.small', 'Es gibt die Kasse schon? Dann brauchst du nur ihren Namen und ihr Passwort.'),
    ),
  );
}
