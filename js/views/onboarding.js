/** Erster Start: Urlaub anlegen — oder einer Einladung folgen. */
import { h, icon } from '../dom.js';
import { toast } from '../ui/sheet.js';
import { todayISO, addDays, daysInclusive, isValidDate } from '../calc.js';
import { days, fullDate } from '../format.js';
import * as store from '../store.js';

export function renderOnboarding(state, actions) {
  return state.invite ? inviteScreen(state, actions) : createScreen(state, actions);
}

function inviteScreen(state) {
  const { invite, trip } = state;
  const error = h('p.field__error');
  const button = h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: join }, icon('check', 20), 'Beitreten');

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
      trip ? h('p.field__note', `Wenn du beitrittst, wird „${trip.name}“ auf diesem Gerät durch den geteilten Urlaub ersetzt. Gelöscht wird dabei nichts.`) : null,
      button,
      error,
      h('button.btn.btn--ghost', { type: 'button', onclick: () => store.dismissInvite() },
        trip ? `Zurück zu „${trip.name}“` : 'Stattdessen eigenen Urlaub anlegen'),
    ),
  );
}

function createScreen(state) {
  const today = todayISO();
  const values = {
    name: '',
    startDate: today,
    endDate: addDays(today, 13),
    currency: 'EUR',
    budgetMode: 'dynamic',
    peopleNames: ['', ''],
    myIndex: 0,
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

  const nameInputs = values.peopleNames.map((n, i) =>
    h('input.field__input', {
      type: 'text', value: n, maxlength: 30, autocomplete: 'off',
      placeholder: i === 0 ? 'Dein Name' : 'Der andere Name',
      // `input` statt `change`: die Auswahl darunter soll beim Tippen mitlaufen.
      oninput: (e) => { values.peopleNames[i] = e.target.value; renderMeChips(); },
    }));

  const meChips = h('div.chips');
  const renderMeChips = () => {
    meChips.replaceChildren(...values.peopleNames.map((n, i) =>
      h('button.chip', { type: 'button', class: values.myIndex === i ? 'is-active' : '', onclick: () => { values.myIndex = i; renderMeChips(); } },
        n.trim() || (i === 0 ? 'Die erste Person' : 'Die zweite Person'))));
  };
  renderMeChips();

  const error = h('p.field__error');
  const submit = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, icon('check', 20), 'Los geht’s');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValidDate(values.startDate) || !isValidDate(values.endDate) || values.endDate < values.startDate) {
      error.textContent = 'Bitte einen gültigen Zeitraum wählen.';
      return;
    }
    if (values.peopleNames.some((n) => !n.trim())) {
      // Ohne Namen steht in der Abrechnung später „Person 1“ und „Person 2“.
      error.textContent = 'Bitte beide Namen eintragen.';
      nameInputs[values.peopleNames.findIndex((n) => !n.trim())].focus();
      return;
    }
    error.textContent = '';
    submit.disabled = true;
    try {
      await store.createTrip(values);
    } catch (err) {
      error.textContent = err?.message || String(err);
      submit.disabled = false;
    }
  };

  return h('div.view',
    h('div.welcome.welcome--compact',
      h('div.welcome__mark', '€'),
      h('h1.welcome__title', 'Urlaubskasse anlegen'),
      h('p.welcome__text', 'Ihr tragt ein, was ihr aufs gemeinsame Konto überwiesen habt. Die App rechnet daraus euer Tagesbudget — und ihr hakt abends kurz ab, was ausgegeben wurde.'),
    ),
    h('form.card.card--plain', { onsubmit: onSubmit },
      h('label.field', h('span.field__label', 'Wie heißt der Urlaub?'),
        h('input.field__input', { type: 'text', value: values.name, maxlength: 60, placeholder: 'Unser Urlaub', oninput: (e) => { values.name = e.target.value; } })),
      h('div.field__pair',
        h('label.field', h('span.field__label', 'Von'), startInput),
        h('label.field', h('span.field__label', 'Bis'), endInput),
      ),
      rangeNote,
      h('div.field',
        h('span.field__label', 'Ihr beide'),
        h('div.field__pair', ...nameInputs),
      ),
      h('div.field', h('span.field__label', 'Wer sitzt an diesem Handy?'), meChips),
      error,
      submit,
      h('p.muted.small', 'Läuft erst mal nur auf diesem Gerät. In den Einstellungen könnt ihr den Urlaub später mit dem zweiten Handy teilen.'),
    ),
  );
}
