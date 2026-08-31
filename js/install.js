/**
 * Installierbarkeit dieser PWA.
 *
 * Ein Einladungslink öffnet immer zuerst im Browser — welche App einen Link
 * bekommt, entscheidet das Betriebssystem, nicht diese Seite; das lässt sich
 * von hier aus nicht umgehen, auch nicht für Geräte, auf denen die App längst
 * installiert ist. Was tatsächlich hilft: früh genug zur Installation
 * einladen, damit aus dem Browser-Tab ein Symbol auf dem Startbildschirm
 * wird — danach läuft die App in ihrem eigenen Fenster, ganz ohne Adresszeile.
 */

function detectStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

let deferredPrompt = null;
let installed = detectStandalone();
const listeners = new Set();

function notify() {
  for (const cb of listeners) cb();
}

/** Läuft die App schon im eigenständigen Fenster (oder ist als installiert bekannt)? */
export function isInstalled() {
  return installed;
}

/**
 * iOS/iPadOS lösen `beforeinstallprompt` nie aus — Safari kennt dafür weder
 * ein Ereignis noch einen anderen programmgesteuerten Weg. Dort bleibt nur
 * die Anleitung über das Teilen-Menü.
 */
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

/** Steht der native Installationsdialog bereit? */
export function canPromptInstall() {
  return !installed && !!deferredPrompt;
}

/** Ruft ihn auf. Löst mit `true` auf, wenn installiert wurde. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome === 'accepted';
}

/** Ruft `cb` auf, wenn sich Installierbarkeit oder Installationsstatus ändern. */
export function onInstallabilityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // sonst zeigt Chrome zusätzlich sein eigenes Mini-Infobar-Banner
  deferredPrompt = e;
  notify();
});

addEventListener('appinstalled', () => {
  installed = true;
  deferredPrompt = null;
  notify();
});
