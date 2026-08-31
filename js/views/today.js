/**
 * Startbildschirm: eine große Zahl, damit man den Blick aufs Geld in zwei
 * Sekunden erledigt hat und wieder Urlaub machen kann.
 */
import { h, icon } from '../dom.js';
import { computeBudget, plannedOnly, todayISO, MAX_PEOPLE } from '../calc.js';
import { money, moneySigned, days, compactDate } from '../format.js';
import { tile, sectionTitle, expenseRow, plannedRow, emptyState, bar } from '../ui/parts.js';

const TONE = { good: 'good', tight: 'warn', over: 'over', empty: 'muted' };

export function renderToday(state, actions) {
  const { trip, expenses, contributions } = state;
  const knowsMe = trip.people.some((p) => p.id === state.myPersonId);
  const today = todayISO();
  const b = computeBudget({ trip, contributions, expenses, today });
  const cur = trip.currency;
  const todays = expenses.filter((e) => e.date === today && !e.planned);
  // Fällig heißt: das Datum ist erreicht, der Haken fehlt noch. Alles, was
  // erst nächste Woche dran ist, steht unter „Ausgaben“ — hier wäre es eine
  // zweite Kopie derselben Liste und nichts, was heute jemand anfassen müsste.
  const due = plannedOnly(expenses).filter((e) => e.date <= today);
  const rowOpts = { onEdit: actions.editExpense, onRepeat: actions.repeatExpense, me: state.myPersonId };

  return h('div.view',
    hero(b, cur, actions),
    knowsMe ? null : whoAmI(trip, actions),
    // Die drei Kacheln beantworten, was die große Zahl offenlässt: wie viel
    // insgesamt noch da ist, wie lange es reichen muss, und ob ihr vor oder
    // hinter dem Plan liegt. Jede Zahl steht genau einmal auf dieser Seite.
    h('div.tiles',
      // Nach dem Urlaub steht das übrige Geld schon groß oben — dann sagt die
      // Kachel lieber, wofür es weg ist.
      b.phase === 'after'
        ? tile('Ausgegeben', money(b.spent, cur), `über ${days(b.totalDays)}`)
        // Untertexte bleiben einzeilig, sonst stehen die drei Kacheln
        // unterschiedlich hoch nebeneinander. Ist etwas verplant, ist das die
        // Antwort auf „warum ist verfügbar weniger als die Kasse?“ — sonst
        // sagt der Kassenstand mehr.
        : tile('Verfügbar', money(b.free, cur), b.planned ? `${money(b.planned, cur)} verplant` : `von ${money(b.total, cur)}`, { tone: b.free < 0 ? 'over' : '' }),
      tile(
        b.phase === 'after' ? 'Urlaub' : 'Noch',
        b.phase === 'after' ? 'vorbei' : b.phase === 'before' ? days(b.daysUntilStart) : days(b.daysLeft),
        b.phase === 'before' ? `ab ${compactDate(trip.startDate)}` : `bis ${compactDate(trip.endDate)}`,
      ),
      tile(
        'Polster',
        b.elapsedDays ? moneySigned(b.buffer, cur) : '—',
        b.elapsedDays ? (b.buffer >= 0 ? 'unter dem Plan' : 'über dem Plan') : 'ab dem ersten Tag',
        { tone: b.elapsedDays && b.buffer < 0 ? 'over' : '' },
      ),
    ),
    due.length
      ? h('section.section',
          sectionTitle('Fällig', h('span.section__meta', money(due.reduce((a, e) => a + e.amount, 0), cur))),
          h('div.list.list--planned', ...due.map((e) => plannedRow(e, trip, today, { onEdit: actions.editExpense, onPaid: actions.markExpensePaid, me: state.myPersonId }))),
          h('p.section__note', 'Tippt den Haken, sobald bezahlt ist.'),
        )
      : null,

    h('section.section',
      sectionTitle(
        'Heute eingetragen',
        todays.length ? h('span.section__meta', money(todays.reduce((a, e) => a + e.amount, 0), cur)) : null,
      ),
      todays.length
        ? h('div.list', ...todays.map((e) => expenseRow(e, trip, rowOpts)))
        : emptyState('Heute noch nichts eingetragen.', 'Ausgabe eintragen', actions.addExpense),
    ),
    b.phase === 'after' ? h('div.callout',
      h('p', 'Der Urlaub ist vorbei. Die Endabrechnung — wer wem noch was überweist — steht unter ', h('strong', 'Budget'), '.'),
      h('button.btn.btn--ghost', { type: 'button', onclick: () => actions.goto('budget') }, 'Zur Abrechnung'),
    ) : null,
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
    h('p', 'Die App ordnet privat bezahlte Ausgaben deinem Namen zu — ohne die Angabe fehlen sie in der Endabrechnung.'),
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
 * insgesamt verfügbar ist, steht jetzt in der Kachelreihe; was heute schon
 * ausgegeben und was verplant ist, steht in den beiden Abschnitten darunter.
 */
function hero(b, cur, actions) {
  if (b.status === 'empty') {
    return h('div.hero.hero--muted',
      h('p.hero__label', 'Noch kein Geld in der Kasse'),
      h('p.hero__amount', '—'),
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

  return h('div.hero', { class: `hero--${tone}` },
    h('p.hero__label', b.leftToday >= 0 ? 'Heute noch übrig' : 'Heute schon drüber'),
    h('p.hero__amount', money(Math.abs(b.leftToday), cur)),
    h('p.hero__sub', `von ${money(b.perDayToday, cur)} für heute`),
    bar(usedRatio, tone),
  );
}
