/**
 * Der Sperrbildschirm.
 *
 * Er ersetzt die ganze Ansicht, statt sich darüberzulegen: was hinter einem
 * halbdurchsichtigen Feld noch zu lesen wäre, sind Beträge, Namen und die
 * Abrechnung — genau das, was hier nicht zu sehen sein soll. Auch offene Sheets
 * macht `app.js` beim Zusperren zu.
 *
 * Getippt wird auf derselben Zahlentastatur wie beim Eintragen einer Ausgabe:
 * große Tasten, keine Systemtastatur, die beim Aufklappen die Hälfte verdeckt.
 */
import { h, icon, replace } from '../dom.js';
import * as lock from '../lock.js';

const MAX = 12;

export function lockScreen({ onUnlocked } = {}) {
  let code = '';
  let busy = false;

  const dots = h('div.lockscreen__dots');
  const message = h('p.lockscreen__msg', { role: 'status', 'aria-live': 'polite' });
  const bio = lock.status().biometrics
    ? h('button.btn.btn--ghost.btn--wide', { type: 'button', onclick: () => useBiometrics() }, icon('person', 18), 'Mit Fingerabdruck oder Gesicht')
    : null;

  const renderDots = () => {
    replace(dots, ...Array.from({ length: Math.max(4, code.length) }, (_, i) =>
      h('span.lockscreen__dot', { class: i < code.length ? 'is-on' : '' })));
    // Ohne diese Angabe liest ein Screenreader nur „Punkt Punkt Punkt“.
    dots.setAttribute('aria-label', `${code.length} von höchstens ${MAX} Ziffern`);
  };

  const countdown = () => {
    const wait = lock.waitMs();
    if (wait <= 0) return false;
    message.textContent = `Zu viele Versuche. Noch ${Math.ceil(wait / 1000)} Sekunden.`;
    setTimeout(() => { if (!countdown()) message.textContent = ''; }, 1000);
    return true;
  };

  async function submit() {
    if (busy || !code) return;
    if (countdown()) { code = ''; renderDots(); return; }
    busy = true;
    try {
      if (await lock.unlock(code)) {
        onUnlocked?.();
        return;
      }
      message.textContent = 'Falscher Code.';
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    } catch (err) {
      message.textContent = err?.message || 'Ging nicht.';
    } finally {
      busy = false;
      code = '';
      renderDots();
      countdown();
    }
  }

  async function useBiometrics() {
    message.textContent = '';
    try {
      if (await lock.unlockWithBiometrics()) onUnlocked?.();
    } catch (err) {
      // Abgebrochen ist keine Fehlermeldung wert — der Code steht ja daneben.
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        message.textContent = err?.message || 'Das hat nicht geklappt.';
      }
    }
  }

  const press = (value) => {
    if (value === 'del') code = code.slice(0, -1);
    else if (value === 'ok') return submit();
    else if (code.length < MAX) code += value;
    message.textContent = '';
    renderDots();
    if (navigator.vibrate) navigator.vibrate(8);
    return undefined;
  };

  const key = (label, value, cls = '') =>
    h('button.key', {
      type: 'button',
      class: cls,
      'aria-label': value === 'del' ? 'Ziffer löschen' : value === 'ok' ? 'Entsperren' : label,
      onclick: () => press(value),
    }, value === 'del' ? icon('back', 22) : value === 'ok' ? icon('check', 22) : label);

  renderDots();
  countdown();

  return h('div.view.view--center.lockscreen',
    h('div.lockscreen__inner',
      h('div.welcome__mark', '€'),
      h('h1.lockscreen__title', 'Gesperrt'),
      h('p.lockscreen__text', 'Code eintippen, um die Urlaubskasse zu öffnen.'),
      dots,
      message,
      h('div.keypad',
        ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, d)),
        key('', 'del', 'key--muted'),
        key('0', '0'),
        key('', 'ok', 'key--go'),
      ),
      bio,
    ),
  );
}
