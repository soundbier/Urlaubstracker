/**
 * Die Anmeldemaske — der erste Bildschirm, wenn eine Cloud eingerichtet ist
 * und auf diesem Gerät noch nichts entschieden wurde.
 *
 * Sie ersetzt die ganze Ansicht, wie der Sperrbildschirm: dahinter gibt es zu
 * diesem Zeitpunkt ohnehin nichts zu sehen.
 *
 * Drei Wege, und der dritte ist kein Notausgang, sondern eine gleichwertige
 * Antwort: wer allein auf diesem Gerät rechnet, braucht kein Konto und soll
 * auch keins anlegen müssen. Ein Konto verlangt diese App für genau eine
 * Sache — eine Kasse, die mehr als ein Gerät sieht.
 *
 * Firebase wird hier erst geladen, wenn jemand tatsächlich „Anmelden“ oder
 * „Konto erstellen“ wählt. Wer „Nur auf diesem Gerät“ nimmt, lädt bis zuletzt
 * kein einziges Byte davon — das Versprechen des lokalen Modus gilt auch auf
 * diesem Bildschirm, nicht erst dahinter.
 */
import { h, icon, replace } from '../dom.js';
import { toast } from '../ui/sheet.js';
import { privacySheet } from '../ui/parts.js';
import { plainInput, maskedInput, maskedField } from '../ui/join-sheet.js';
import { checkEmail, checkAccountPassword, checkDisplayName } from '../account.js';
import { suggestPassword } from '../join.js';
import * as store from '../store.js';

/**
 * Welcher der Bildschirme gerade dran ist. Bleibt über das Neuzeichnen hinweg
 * stehen, solange die Maske offen ist — sonst spränge sie beim ersten
 * Tastendruck zurück auf die Auswahl.
 */
let mode = 'choose'; // choose | signIn | signUp | verify | reset

export function resetAuthView() {
  mode = 'choose';
}

/** Welcher Bildschirm gehört zu diesem Anmeldezustand? */
export function authViewFor(status) {
  if (status === 'unverified') return 'verify';
  return mode;
}

export function renderAuth(state, actions) {
  const status = state.account?.status || 'signedOut';
  const view = authViewFor(status);

  const go = (next) => { mode = next; actions.rerender(); };

  if (view === 'verify') return verifyScreen(state, actions);
  if (view === 'signIn') return signInScreen(state, actions, go);
  if (view === 'signUp') return signUpScreen(state, actions, go);
  if (view === 'reset') return resetScreen(state, actions, go);
  return chooseScreen(state, actions, go);
}

// --------------------------------------------------------------------- Auswahl

function chooseScreen(state, actions, go) {
  return shell(
    h('h1.welcome__title', 'Willkommen'),
    h('p.welcome__text', 'Mit einem Konto siehst du alle Kassen, in denen du mitfährst — auf jedem Gerät, mit dem du dich anmeldest.'),
    h('button.btn.btn--primary.btn--wide', { type: 'button', onclick: () => go('signUp') }, 'Konto erstellen'),
    h('button.btn.btn--wide', { type: 'button', onclick: () => go('signIn') }, 'Ich habe schon ein Konto'),
    h('div.authscreen__or', h('span', 'oder')),
    // Kein Konto ist hier eine Antwort, keine Ausrede: allein auf diesem Gerät
    // verlässt kein Eintrag den Browser, und dafür braucht es niemanden, bei
    // dem man sich anmeldet.
    h('button.btn.btn--ghost.btn--wide', {
      type: 'button',
      onclick: async () => { await store.chooseLocalOnly(); actions.rerender(); },
    }, 'Nur auf diesem Gerät rechnen'),
    h('p.field__note', 'Ohne Konto bleibt alles im Speicher dieses Browsers — verschlüsselt und auf keinem Server. Teilen geht später jederzeit, dann braucht es eins.'),
    // Aus den Einstellungen heraus aufgerufen, während eine Kasse offen ist:
    // dann muss es auch ohne Entscheidung wieder zurückgehen.
    state.accountScreen && state.trip
      ? h('button.btn.btn--ghost.btn--small', {
          type: 'button',
          onclick: () => { store.hideAccountScreen(); actions.rerender(); },
        }, icon('back', 16), `Zurück zu „${state.trip.name}“`)
      : null,
  );
}

// -------------------------------------------------------------------- Anmelden

function signInScreen(state, actions, go) {
  const email = plainInput({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'du@example.org', enterkeyhint: 'next' });
  const password = maskedInput({ autocomplete: 'current-password', placeholder: 'Passwort', enterkeyhint: 'go' });
  const error = h('p.field__error');
  const button = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Anmelden');

  async function submit(e) {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    try {
      await store.signIn({ email: email.value, password: password.value });
      toast('Angemeldet.', { type: 'success' });
      mode = 'choose';
      actions.rerender();
    } catch (err) {
      error.textContent = err?.message || String(err);
      button.disabled = false;
    }
  }

  return shell(
    h('h1.welcome__title', 'Anmelden'),
    h('form.authscreen__form', { onsubmit: submit, oninput: () => { error.textContent = ''; } },
      field('E-Mail', email),
      field('Passwort', maskedField(password)),
      error,
      button,
    ),
    h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: () => go('reset') }, 'Passwort vergessen'),
    h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: () => go('choose') }, icon('back', 16), 'Zurück'),
  );
}

// ------------------------------------------------------------------ Registrieren

function signUpScreen(state, actions, go) {
  const email = plainInput({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'du@example.org', enterkeyhint: 'next' });
  const name = plainInput({ autocomplete: 'nickname', maxlength: 40, placeholder: 'z. B. Anna', enterkeyhint: 'next' });
  const password = maskedInput({ autocomplete: 'new-password', placeholder: 'Mindestens 10 Zeichen', enterkeyhint: 'go' });
  const error = h('p.field__error');
  const button = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Konto erstellen');

  // Derselbe Vorschlag wie beim Kassenpasswort: zwei Silben und eine Zahl,
  // vorlesbar und trotzdem lang genug.
  const suggest = h('button.btn.btn--ghost.btn--small', {
    type: 'button',
    onclick: () => {
      password.value = suggestPassword();
      password.type = 'text';
      password.focus();
      // Ein von Hand gesetzter Wert löst kein `input` aus — hier aber soll er
      // wie eine Eingabe zählen, damit die alte Fehlermeldung verschwindet.
      password.dispatchEvent(new Event('input', { bubbles: true }));
    },
  }, icon('repeat', 16), 'Vorschlag');

  async function submit(e) {
    e.preventDefault();
    error.textContent = '';
    // Vor dem Netzweg prüfen, was sich hier prüfen lässt — eine Fehlermeldung
    // ohne Wartezeit ist die bessere.
    for (const problem of [checkEmail(email.value), checkDisplayName(name.value), checkAccountPassword(password.value)]) {
      if (problem) { error.textContent = problem; return; }
    }
    button.disabled = true;
    try {
      await store.signUp({ email: email.value, password: password.value, displayName: name.value });
      actions.rerender();
    } catch (err) {
      error.textContent = err?.message || String(err);
      button.disabled = false;
    }
  }

  return shell(
    h('h1.welcome__title', 'Konto erstellen'),
    h('p.welcome__text.small', 'Wir schicken dir eine E-Mail zum Bestätigen. Erst danach lassen sich Kassen anlegen oder teilen.'),
    // Sobald jemand etwas ändert, ist die alte Meldung überholt: sie beschriebe
    // einen Zustand, den es nicht mehr gibt. Das gilt auch für den
    // Vorschlag-Knopf, der das Passwortfeld von außen füllt.
    h('form.authscreen__form', { onsubmit: submit, oninput: () => { error.textContent = ''; } },
      field('E-Mail', email),
      field('Anzeigename', name, 'Steht an deinen Einträgen — ein Spitzname reicht.'),
      field('Passwort', h('div.authscreen__pwrow', maskedField(password), suggest)),
      error,
      button,
    ),
    h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: () => go('choose') }, icon('back', 16), 'Zurück'),
    h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: () => privacySheet({ mode: 'cloud' }) }, 'Datenschutz'),
  );
}

// ------------------------------------------------------------------ Bestätigen

/**
 * Der Wartebildschirm zwischen „Konto angelegt“ und „darf loslegen“.
 *
 * Nachgesehen wird nur auf Tipp, nicht im Sekundentakt: Firebase erneuert das
 * Merkmal, auf das es ankommt (`email_verified`), ohnehin nicht von selbst —
 * dafür braucht es den Griff in `refreshVerification`, und den löst hier
 * dieser Knopf aus.
 */
function verifyScreen(state, actions) {
  const message = h('p.lockscreen__msg', { role: 'status', 'aria-live': 'polite' });
  const address = state.account?.email || 'deine Adresse';

  const check = h('button.btn.btn--primary.btn--wide', {
    type: 'button',
    onclick: async () => {
      check.disabled = true;
      message.textContent = '';
      try {
        const next = await store.refreshVerification();
        if (next?.status === 'ready') {
          toast('Adresse bestätigt.', { type: 'success' });
          actions.rerender();
          return;
        }
        message.textContent = 'Noch nicht bestätigt. Sieh im Postfach nach — auch im Spam-Ordner.';
      } catch (err) {
        message.textContent = err?.message || String(err);
      } finally {
        check.disabled = false;
      }
    },
  }, 'Ich habe bestätigt');

  const resend = h('button.btn.btn--ghost.btn--wide', {
    type: 'button',
    onclick: async () => {
      resend.disabled = true;
      message.textContent = '';
      try {
        await store.resendVerification();
        toast('Noch einmal verschickt.', { type: 'success' });
      } catch (err) {
        message.textContent = err?.message || String(err);
      } finally {
        resend.disabled = false;
      }
    },
  }, 'E-Mail noch einmal schicken');

  return shell(
    h('h1.welcome__title', 'Bestätige deine E-Mail'),
    h('p.welcome__text', h('span', 'Wir haben eine Nachricht an ', h('strong', address), ' geschickt. Tippe auf den Link darin.')),
    message,
    check,
    resend,
    h('button.btn.btn--ghost.btn--small', {
      type: 'button',
      onclick: async () => { await store.signOutAccount(); resetAuthView(); actions.rerender(); },
    }, 'Abmelden'),
  );
}

// ------------------------------------------------------------ Passwort vergessen

function resetScreen(state, actions, go) {
  const email = plainInput({ type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'du@example.org', enterkeyhint: 'go' });
  const error = h('p.field__error');
  const done = h('p.field__note');
  const button = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Link schicken');

  async function submit(e) {
    e.preventDefault();
    error.textContent = '';
    done.textContent = '';
    button.disabled = true;
    try {
      await store.resetPassword(email.value);
      // Bewusst ohne die Auskunft, ob es zu dieser Adresse ein Konto gibt —
      // das wäre der bequemste Weg herauszufinden, wer hier ein Konto hat.
      done.textContent = 'Wenn es zu dieser Adresse ein Konto gibt, ist die Nachricht unterwegs.';
    } catch (err) {
      error.textContent = err?.message || String(err);
    } finally {
      button.disabled = false;
    }
  }

  return shell(
    h('h1.welcome__title', 'Passwort vergessen'),
    h('p.welcome__text.small', 'Wir schicken einen Link zum Neusetzen.'),
    h('form.authscreen__form', { onsubmit: submit },
      field('E-Mail', email),
      error,
      done,
      button,
    ),
    h('button.btn.btn--ghost.btn--small', { type: 'button', onclick: () => go('signIn') }, icon('back', 16), 'Zurück'),
  );
}

// ------------------------------------------------------------------- Bausteine

function shell(...children) {
  return h('div.view.view--center.authscreen',
    h('div.welcome',
      h('div.welcome__mark', '€'),
      ...children,
    ),
  );
}

function field(label, control, note) {
  return h('label.field',
    h('span.field__label', label),
    control,
    note ? h('span.field__note', note) : null,
  );
}
