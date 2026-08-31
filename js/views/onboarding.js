/** Erster Start: Urlaubskasse anlegen — oder einer Einladung folgen. */
import { h, icon } from '../dom.js';
import { toast } from '../ui/sheet.js';
import { todayISO, addDays, daysInclusive, isValidDate, MAX_PEOPLE, PERSON_COLORS } from '../calc.js';
import { days, fullDate } from '../format.js';
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
    ),
  );
}

/**
 * Der erste Bildschirm überhaupt — und der einzige, an dem noch nichts erklärt
 * ist. Deshalb steht hier nur, was die App wirklich braucht: wie der Urlaub
 * heißt, wie lange er dauert, und wer mitfährt.
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

  const onSubmit = async (e) => {
    e.preventDefault();
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
    try {
      // Der erste Name ist die Person an diesem Gerät.
      await store.createTrip({ ...values, peopleNames: people, myIndex: 0 });
    } catch (err) {
      error.textContent = err?.message || String(err);
      submit.disabled = false;
    }
  };

  return h('div.view',
    h('div.welcome.welcome--compact',
      h('div.welcome__mark', '€'),
      h('h1.welcome__title', 'Urlaubskasse anlegen'),
      h('p.welcome__text', 'Tragt ein, was in die gemeinsame Kasse eingezahlt wurde. Die App rechnet daraus das Tagesbudget — und unterwegs hakt ihr kurz ab, was ausgegeben wurde.'),
    ),
    h('form.panel', { onsubmit: onSubmit },
      h('label.field', h('span.field__label', 'Wie heißt der Urlaub?'),
        h('input.field__input', { type: 'text', value: values.name, maxlength: 60, placeholder: 'Unser Urlaub', oninput: (e) => { values.name = e.target.value; } })),
      h('div.field__pair',
        h('label.field', h('span.field__label', 'Von'), startInput),
        h('label.field', h('span.field__label', 'Bis'), endInput),
      ),
      rangeNote,
      h('div.field',
        h('span.field__label', 'Wer reist mit?'),
        peopleList,
        addButton,
        h('p.field__note', 'Das erste Feld bist du — daran erkennt die App später, wer an diesem Gerät sitzt. Namen lassen sich jederzeit ändern.'),
      ),
      error,
      submit,
      h('p.muted.small', 'Läuft erst mal nur auf diesem Gerät. In den Einstellungen könnt ihr die Kasse später mit weiteren Geräten teilen.'),
    ),
  );
}
