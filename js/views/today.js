/**
 * Startbildschirm: „Was steht heute an?“ — das Programm des Tages zuerst,
 * die Kasse als weiterhin wichtige, aber zweite Frage darunter.
 */
import { h, icon } from '../dom.js';
import { computeBudget, plannedOnly, planItemsOnDay, clampDateToTrip, addDays, daysInclusive, todayISO, MAX_PEOPLE } from '../calc.js';
import { money, moneySigned, days, compactDate, dayMonth, weekdayShort } from '../format.js';
import { stat, sectionTitle, expenseRow, plannedRow, planItemRow, emptyState, bar, daymark } from '../ui/parts.js';
import { setFinancePane } from './finances.js';

// Der Tagesbudget-Balken bleibt im Normalfall farblos (neutral) — Farbe ist
// Verdikt, kein Dauerzustand. Erst beim Kippen ins Knappe oder Über zeigt er
// Amber bzw. Karmesin; „gut“ braucht dafür keine eigene Farbe.
const TONE = { good: 'neutral', tight: 'warn', over: 'over' };

/**
 * Welcher Tag im Programm-Abschnitt gerade offen ist — wie der Filter unter
 * „Ausgaben“ nur für die laufende Sitzung gemerkt, nicht gespeichert: das ist
 * eine Frage der Ansicht, keine Angabe zur Reise. Voreingestellt ist der
 * heutige Tag, in den Reisezeitraum gezwungen — vor der Abfahrt zeigt sich
 * so gleich der erste Reisetag, nach der Rückkehr der letzte.
 */
let selectedDate = null;

function resolveSelectedDate(trip) {
  selectedDate = clampDateToTrip(selectedDate || todayISO(), trip);
  return selectedDate;
}

function setSelectedDate(date) {
  // Ohne Klemmen: `resolveSelectedDate` holt einen Tag außerhalb der Reise
  // beim nächsten Aufbau ohnehin zurück, und zwar mit dem dann gültigen
  // Zeitraum — hier wäre er womöglich schon veraltet.
  selectedDate = date;
}

/**
 * Einen bestimmten Tag aufschlagen — von der Tagesplanung aus, wo die
 * Übersicht aller Tage steht. Übersicht und Tagesansicht, wie Monats- und
 * Tagesblatt im Kalender.
 */
export function openPlanDay(date) {
  setSelectedDate(date);
}

export function renderToday(state, actions) {
  const { trip, expenses, contributions, planItems } = state;
  const knowsMe = trip.people.some((p) => p.id === state.myPersonId);
  const today = todayISO();
  const b = computeBudget({ trip, contributions, expenses, today });
  const cur = trip.currency;
  const todays = expenses.filter((e) => e.date === today && !e.planned);
  // Fällig heißt: das Datum ist erreicht, der Haken fehlt noch. Alles, was
  // erst nächste Woche dran ist, steht unter „Ausgaben“ — hier wäre es eine
  // zweite Kopie derselben Liste und nichts, was heute jemand anfassen müsste.
  const due = plannedOnly(expenses).filter((e) => e.date <= today);
  // Nur wirklich überfällig ist ein Verdikt — „heute dran“ ist der Normalfall
  // und bekommt keine Warnfarbe, sonst würde die Seite jeden Tag Alarm geben.
  const overdueCount = due.filter((e) => e.date < today).length;
  const rowOpts = { onEdit: actions.editExpense, onRepeat: actions.repeatExpense, me: state.myPersonId };

  const selected = resolveSelectedDate(trip);
  const dayItems = planItemsOnDay(planItems, selected);
  const expenseById = new Map(expenses.map((e) => [e.id, e]));

  return h('div.view',
    // Das Programm des Tages ist jetzt die erste Frage der Seite — dafür
    // steht die Kasse, bislang der Aufmacher, ab der Trennlinie weiter unten.
    dayNav(trip, selected, today, actions),
    h('section.section',
      sectionTitle('Programm', h('button.btn.btn--small', { type: 'button', onclick: () => actions.addPlanItem({ date: selected }) }, icon('plus', 16), 'Eintragen')),
      dayItems.length
        ? h('div.list', ...dayItems.map((item) => planItemRow(item, trip, { onEdit: actions.editPlanItem, onToggle: actions.togglePlanItem, expenseById })))
        : h('p.section__note', 'Für diesen Tag ist noch nichts geplant.'),
    ),

    sectionTitle('Kasse'),
    knowsMe ? null : whoAmI(trip, actions),
    hero(b, cur, actions, today),
    // Die drei Kennzahlen beantworten, was die große Zahl offenlässt: wie viel
    // insgesamt noch da ist, wie lange es reichen muss, und ob ihr vor oder
    // hinter dem Plan liegt. Jede Zahl steht genau einmal auf dieser Seite.
    h('div.stats',
      // Nach dem Urlaub steht das übrige Geld schon groß oben — dann sagt die
      // Spalte lieber, wofür es weg ist.
      b.phase === 'after'
        ? stat('Ausgegeben', money(b.spent, cur), `über ${days(b.totalDays)}`)
        // Untertexte bleiben einzeilig, sonst stehen die drei Spalten
        // unterschiedlich hoch nebeneinander. Ist etwas verplant, ist das die
        // Antwort auf „warum ist verfügbar weniger als die Kasse?“ — sonst
        // sagt der Kassenstand mehr.
        : stat('Verfügbar', money(b.free, cur), b.planned ? `${money(b.planned, cur)} verplant` : `von ${money(b.total, cur)}`, { tone: b.free < 0 ? 'over' : '' }),
      stat(
        b.phase === 'after' ? 'Urlaub' : 'Noch',
        b.phase === 'after' ? 'vorbei' : b.phase === 'before' ? days(b.daysUntilStart) : days(b.daysLeft),
        b.phase === 'before' ? `ab ${compactDate(trip.startDate)}` : `bis ${compactDate(trip.endDate)}`,
      ),
      stat(
        'Polster',
        b.elapsedDays ? moneySigned(b.buffer, cur) : '—',
        b.elapsedDays ? (b.buffer >= 0 ? 'unter dem Plan' : 'über dem Plan') : 'ab dem ersten Tag',
        { tone: b.elapsedDays && b.buffer < 0 ? 'over' : '' },
      ),
    ),

    due.length
      ? h('section.section', { class: 'section--action' },
          sectionTitle(
            'Fällig',
            h('span.section__meta.section__meta--amount', money(due.reduce((a, e) => a + e.amount, 0), cur)),
            { tone: overdueCount ? 'warn' : '' },
          ),
          h('div.list', ...due.map((e) => plannedRow(e, trip, today, { onEdit: actions.editExpense, onPaid: actions.markExpensePaid, me: state.myPersonId, markOverdue: false }))),
          h('p.section__note', 'Tippt den Haken, sobald bezahlt ist.'),
        )
      : null,

    h('section.section', { class: due.length ? '' : 'section--action' },
      sectionTitle(
        'Heute eingetragen',
        todays.length ? h('span.section__meta.section__meta--amount', money(todays.reduce((a, e) => a + e.amount, 0), cur)) : null,
      ),
      todays.length
        ? h('div.list', ...todays.map((e) => expenseRow(e, trip, rowOpts)))
        // Ohne Knopf: der schwebende „Ausgabe“-Knopf steht keine 100 px
        // darunter und macht dasselbe. Zwei Knöpfe für eine Handlung sagen
        // nur, dass niemand entschieden hat, welcher der richtige ist.
        : emptyState('Heute noch nichts eingetragen.'),
    ),
    b.phase === 'after' ? h('div.callout',
      h('p', 'Der Urlaub ist vorbei. Wer wem noch was überweist, steht unter ', h('strong', 'Finanzen'), '.'),
      // Direkt auf den Kassen-Reiter, nicht nur auf den Bereich: die
      // Abrechnung ist der Grund, aus dem man hier tippt.
      h('button.btn.btn--ghost', { type: 'button', onclick: () => { setFinancePane('kasse'); actions.goto('finanzen'); } }, 'Zur Abrechnung'),
    ) : null,
  );
}

/**
 * Die Tageswahl über dem Programm: „Tag X von Y“ als Augenbraue, das Datum
 * darunter in der Serife — dieselbe Rolle, die früher nur der Tagesstempel im
 * Kassenblock trug, jetzt aber blätterbar, mit Pfeilen auf beiden Seiten. Der
 * „Heute“-Knopf taucht nur auf, wenn man tatsächlich woanders hingeblättert
 * hat und ein echtes Heute im Reisezeitraum liegt, zu dem es sich lohnt,
 * zurückzuspringen.
 */
function dayNav(trip, selected, today, actions) {
  const dayIndex = daysInclusive(trip.startDate, selected);
  const totalDays = daysInclusive(trip.startDate, trip.endDate);
  const atStart = selected <= trip.startDate;
  const atEnd = selected >= trip.endDate;
  const canJumpToday = today !== selected && today >= trip.startDate && today <= trip.endDate;

  const go = (delta) => { setSelectedDate(addDays(selected, delta)); actions.rerender(); };
  const jumpToday = () => { setSelectedDate(today); actions.rerender(); };

  return h('div.daynav',
    h('button.icon-btn.daynav__arrow.daynav__arrow--prev', {
      type: 'button', disabled: atStart, title: 'Vorheriger Tag', 'aria-label': 'Vorheriger Tag', onclick: () => go(-1),
    }, icon('chevron', 20)),
    h('div.daynav__main',
      h('div.daynav__row',
        h('p.daynav__eyebrow', `Tag ${String(dayIndex).padStart(2, '0')} / ${totalDays}`),
        canJumpToday ? h('button.btn.btn--small', { type: 'button', onclick: jumpToday }, 'Heute') : null,
      ),
      h('p.daynav__title', `${weekdayShort(selected)}, ${dayMonth(selected)}`),
    ),
    h('button.icon-btn.daynav__arrow.daynav__arrow--next', {
      type: 'button', disabled: atEnd, title: 'Nächster Tag', 'aria-label': 'Nächster Tag', onclick: () => go(1),
    }, icon('chevron', 20)),
  );
}

/**
 * Nach dem Beitritt über eine Einladung weiß das Gerät noch nicht, wer daran
 * sitzt. Ohne diese Angabe landen privat bezahlte Ausgaben in der Abrechnung
 * bei niemandem.
 *
 * Wer über einen geteilten Link dazukommt, steht oft noch gar nicht in der
 * Liste — deshalb der letzte Knopf: er trägt die Person selbst ein, statt sie
 * darauf zu verweisen, dass jemand anderes das zuerst tun muss.
 */
function whoAmI(trip, actions) {
  return h('div.callout',
    h('p.callout__title', 'Wer bist du?'),
    h('p', 'Die App ordnet privat bezahlte Ausgaben deinem Namen zu. Ohne die Angabe fehlen sie in der Endabrechnung.'),
    h('div.chips',
      ...trip.people.map((p) =>
        h('button.chip', { type: 'button', onclick: () => actions.setMyPerson(p.id) },
          h('span.dot', { style: { background: p.color } }), p.name)),
      trip.people.length < MAX_PEOPLE
        ? h('button.chip', { type: 'button', onclick: () => actions.addPerson({ setAsMe: true }) }, icon('plus', 15), 'Ich stehe noch nicht da')
        : null,
    ),
  );
}

/**
 * Eine große Zahl, eine Zeile Zusammenhang, der Balken — mehr nicht.
 *
 * Hier standen einmal sechs Beträge übereinander: Tagesrest, Tagessatz, heute
 * ausgegeben, verplant, verfügbar, Kassenstand. Wer sechs Zahlen liest, liest
 * keine, und die halbe Reihe stand ohnehin gleich darunter noch einmal. Was
 * insgesamt verfügbar ist, steht jetzt in der Kennzahlreihe; was heute schon
 * ausgegeben und was verplant ist, steht in den beiden Abschnitten darunter.
 */
function hero(b, cur, actions, today) {
  if (b.status === 'empty') {
    // Ohne Kasse gibt es keine Zahl. Der Gedankenstrich, der hier stand, war
    // in Zahlengröße gesetzt ein Strich quer über den halben Schirm — der Satz
    // darunter sagt dasselbe, nur verständlich.
    return h('div.hero.hero--muted',
      h('p.hero__title', 'Noch kein Geld in der Kasse'),
      h('p.hero__sub', 'Tragt ein, was auf das gemeinsame Konto überwiesen wurde. Daraus rechnet die App das Tagesbudget.'),
      h('button.btn.btn--primary', { type: 'button', onclick: actions.addContribution }, icon('wallet', 19), 'Einzahlung eintragen'),
    );
  }

  if (b.phase === 'before') {
    return h('div.hero.hero--soon',
      h('p.hero__label', b.daysUntilStart === 0 ? 'Morgen geht es los' : `Losgeht's in ${days(b.daysUntilStart)}`),
      h('p.hero__amount', money(b.planPerDay, cur)),
      h('p.hero__sub', `pro Tag über ${days(b.totalDays)}`),
    );
  }

  if (b.phase === 'after') {
    return h('div.hero', { class: b.remaining < 0 ? 'hero--over' : 'hero--good' },
      h('p.hero__label', b.remaining < 0 ? 'Am Ende gefehlt' : 'Übrig geblieben'),
      h('p.hero__amount', money(Math.abs(b.remaining), cur)),
      h('p.hero__sub', `von ${money(b.total, cur)} in der Kasse`),
    );
  }

  const usedRatio = b.perDayToday > 0 ? b.spentToday / b.perDayToday : b.spentToday > 0 ? 1 : 0;
  const tone = TONE[b.status] || 'good';

  // Der Zustand steht an der Augenbraue und am Balken. Die Zahl selbst bleibt
  // Tinte: eine rote Zahl quer über den halben Schirm liest sich wie ein
  // Fehler, dabei ist „heute drüber“ im Urlaub der halbe Normalfall.
  return h('div.hero', { class: `hero--${tone}` },
    // Der Tagesstempel gilt hier immer dem echten Heute, nicht dem Tag, der im
    // Programm oben gerade aufgeschlagen ist — die Kasse rechnet mit dem
    // Kalender, nicht mit der Blätterei.
    daymark(`Tag ${String(b.elapsedDays).padStart(2, '0')} / ${b.totalDays}`, `${weekdayShort(today)}, ${dayMonth(today)}`),
    h('p.hero__label', b.leftToday >= 0 ? 'Heute noch übrig' : 'Heute schon drüber'),
    h('p.hero__amount', money(Math.abs(b.leftToday), cur)),
    h('p.hero__sub', `von ${money(b.perDayToday, cur)} für heute`),
    bar(usedRatio, tone),
  );
}
