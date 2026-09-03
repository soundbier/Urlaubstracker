/**
 * Beitreten: Name der Kasse, Passwort, fertig.
 *
 * Dasselbe Sheet hängt an zwei Stellen — am ersten Bildschirm („ich habe schon
 * eine Kasse“) und in den Einstellungen. Deshalb liegt es hier und nicht in
 * einer der beiden Ansichten.
 *
 * Der Einladungslink ist damit nicht abgeschafft, er ist nur nicht mehr der
 * einzige Weg: aufgeklappt am Ende steht er weiterhin — und für Geräte, denen
 * die Firebase-Konfiguration der Gruppe noch fehlt, ist er der bequemste.
 */
import { h, icon, replace } from '../dom.js';
import { openSheet, toast } from './sheet.js';
import { disclosure } from './parts.js';
import { checkJoinName, checkPassword } from '../join.js';
import { parseFirebaseConfig, validateFirebaseConfig } from '../prefs.js';
import { readInviteFromLocation } from '../link.js';
import * as store from '../store.js';

/** Ein Feld für etwas, das abgetippt wird: keine Autokorrektur, keine Großschreibung. */
export function plainInput(props = {}) {
  return h('input.field__input', {
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: false,
    ...props,
  });
}

/**
 * Ein Passwortfeld: verdeckt wie jedes Passwortfeld im Web.
 *
 * Stand hier früher als `plainInput` mit `type="text"`, mit der Begründung,
 * das Passwort werde ohnehin laut vorgelesen und abgetippt, nie geheim
 * gehalten. Nur macht das aus jedem Mitlesenden am Tisch, jedem
 * Bildschirmfoto und jeder Bildschirmaufnahme einen Mitwisser. `revealButton`
 * daneben deckt es bei Bedarf trotzdem auf — für den einen Blick, der eine
 * Vertipper-Korrektur erspart.
 */
export function maskedInput(props = {}) {
  return plainInput({ autocomplete: 'current-password', ...props, type: 'password' });
}

/** Das Auge neben einem `maskedInput`: deckt es auf oder wieder zu. */
export function revealButton(input) {
  const button = h('button.icon-btn.field__reveal-btn', {
    type: 'button',
    'aria-label': 'Passwort anzeigen',
    onclick: () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-label', reveal ? 'Passwort verbergen' : 'Passwort anzeigen');
      replace(button, icon(reveal ? 'eyeOff' : 'eye', 20));
    },
  }, icon('eye', 20));
  return button;
}

/** Ein Passwort- oder Passwort-Anzeigefeld mitsamt Auge, fürs Layout in einem Zug. */
export function maskedField(input) {
  return h('div.field__reveal', input, revealButton(input));
}

/**
 * Löst mit `true` auf, wenn der Beitritt geklappt hat.
 *
 * `defaults.name` füllt das Namensfeld vor — praktisch, wenn der Beitritt aus
 * einer Einladung heraus angestoßen wird, die den Namen schon kennt.
 */
export function joinSheet({ name = '' } = {}) {
  const needsConfig = !store.cloudReady();

  return openSheet({
    title: 'Kasse beitreten',
    subtitle: 'Name und Passwort bekommst du von der Gruppe.',
    fullHeight: needsConfig,
    build: (close) => {
      const nameInput = plainInput({ value: name, maxlength: 60, placeholder: 'z. B. Roadtrip Süd 2026', enterkeyhint: 'next' });
      const passwordInput = maskedInput({ maxlength: 60, placeholder: 'Passwort der Kasse', enterkeyhint: 'go' });
      const configInput = h('textarea.field__input.field__input--code', {
        rows: 6, spellcheck: false, autocapitalize: 'off',
        placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  projectId: "…"\n};',
      });
      const linkInput = h('textarea.field__input.field__input--code', { rows: 3, spellcheck: false, placeholder: 'https://…#einladung=…' });

      const error = h('p.field__error');
      const button = h('button.btn.btn--primary.btn--wide', { type: 'submit' }, 'Beitreten');

      const busy = (on, label) => {
        button.disabled = on;
        button.textContent = on ? label : 'Beitreten';
      };

      const fail = (message) => {
        error.textContent = message;
        busy(false);
      };

      const go = async () => {
        const tripName = nameInput.value.trim();
        const password = passwordInput.value;
        const problem = checkJoinName(tripName) || checkPassword(password);
        if (problem) return fail(problem);

        let config = null;
        if (needsConfig) {
          config = parseFirebaseConfig(configInput.value);
          const configProblem = validateFirebaseConfig(config);
          if (configProblem) return fail(`Firebase-Konfiguration: ${configProblem}`);
        }

        error.textContent = '';
        busy(true, 'Trete bei …');
        try {
          await store.joinTripByName({ name: tripName, password, config });
          close(true);
          toast('Du bist dabei.', { type: 'success' });
        } catch (err) {
          fail(err?.message || String(err));
        }
      };

      const goWithLink = async () => {
        const raw = String(linkInput.value);
        const invite = readInviteFromLocation(raw.includes('#') ? raw.slice(raw.indexOf('#')) : '');
        if (!invite) return fail('Dieser Link enthält keine Einladung.');
        error.textContent = '';
        busy(true, 'Trete bei …');
        try {
          await store.joinTrip(invite);
          close(true);
          toast('Du bist dabei.', { type: 'success' });
        } catch (err) {
          fail(err?.message || String(err));
        }
      };

      return h('form.stack', { onsubmit: (e) => { e.preventDefault(); go(); } },
        h('label.field', h('span.field__label', 'Name der Kasse'), nameInput),
        h('label.field', h('span.field__label', 'Passwort'), maskedField(passwordInput)),
        h('p.field__note', 'Beim Namen ist egal, wie er geschrieben steht — beim Passwort zählt jeder Buchstabe.'),
        needsConfig
          ? h('div.field',
              h('span.field__label', 'Firebase-Konfiguration'),
              configInput,
              h('p.field__note', 'Diese Adresse kennt kein Firebase-Projekt. Den Block bekommst du von der Gruppe — oder du nimmst gleich den Einladungslink, der ihn schon enthält.'),
            )
          : null,
        error,
        button,
        disclosure('Ich habe einen Einladungslink', null,
          h('div.stack',
            linkInput,
            h('button.btn.btn--ghost.btn--wide', { type: 'button', onclick: goWithLink }, icon('share', 18), 'Mit Link beitreten'),
          ),
        ),
      );
    },
  }).then((v) => v === true);
}
