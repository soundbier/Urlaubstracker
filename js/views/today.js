/**
 * Startbildschirm: eine große Zahl, damit man den Blick aufs Geld in zwei
 * Sekunden erledigt hat und wieder Urlaub machen kann.
 */
import { h, icon } from '../dom.js';
import { computeBudget, plannedOnly, todayISO } from '../calc.js';
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
  const planned = plannedOnly(expenses);
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
        : tile('Verfügbar', money(b.free, cur), `von ${money(b.total, cur)} in der Kasse`, { tone: b.free < 0 ? 'over' : '' }),
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
    planned.length
      ? h('section.section',
          sectionTitle('Verplant', h('span.section__meta', money(b.planned, cur))),
          h('div.list.list--planned', ...planned.map((e) => plannedRow(e, trip, today, { onEdit: actions.editExpense, onPaid: actions.markExpensePaid, me: state.myPersonId }))),
          h('p.section__note',
            b.plannedOverdue
              ? `${money(b.plannedOverdue, cur)} davon sind fällig — tippt den Haken, sobald bezahlt ist.`
              : 'Dieses Geld ist reserviert und schon vom Tagesbudget abgezogen.',
          ),
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
 */
function whoAmI(trip, actions) {
  return h('div.callout',
    h('p', 'Wer sitzt an diesem Handy? Das braucht die App für die Endabrechnung.'),
    h('div.chips', ...trip.people.map((p) =>
      h('button.chip', { type: 'button', onclick: () => actions.setMyPerson(p.id) },
        h('span.dot', { style: { background: p.color } }), p.name))),
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
      h('p.hero__sub', 'Tragt ein, was ihr beide aufs gemeinsame Konto überwiesen habt. Daraus rechnet die App euer Tagesbudget.'),
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
