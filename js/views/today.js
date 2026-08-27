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

  return h('div.view',
    hero(b, cur, actions),
    knowsMe ? null : whoAmI(trip, actions),
    h('div.tiles',
      tile('Ausgegeben', money(b.spent, cur), `von ${money(b.total, cur)}`),
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
          h('div.list.list--planned', ...planned.map((e) => plannedRow(e, trip, today, { onEdit: actions.editExpense, onPaid: actions.markExpensePaid }))),
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
        ? h('div.list', ...todays.map((e) => expenseRow(e, trip, actions.editExpense)))
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
      h('p.hero__sub', `pro Tag — ${money(b.budgetBase, cur)} auf ${days(b.totalDays)}`),
      b.planned ? h('p.hero__foot', `${money(b.planned, cur)} sind schon verplant und bleiben außen vor`) : null,
      heroTotal(b, cur),
    );
  }

  if (b.phase === 'after') {
    return h('div.hero', { class: b.remaining < 0 ? 'hero--over' : 'hero--good' },
      h('p.hero__label', b.remaining < 0 ? 'Am Ende gefehlt' : 'Übrig geblieben'),
      h('p.hero__amount', money(Math.abs(b.remaining), cur)),
      h('p.hero__sub', `${money(b.spent, cur)} ausgegeben von ${money(b.total, cur)}`),
    );
  }

  const usedRatio = b.perDayToday > 0 ? b.spentToday / b.perDayToday : b.spentToday > 0 ? 1 : 0;
  const tone = TONE[b.status] || 'good';

  return h('div.hero', { class: `hero--${tone}` },
    h('p.hero__label', b.leftToday >= 0 ? 'Heute noch übrig' : 'Heute schon drüber'),
    h('p.hero__amount', money(Math.abs(b.leftToday), cur)),
    h('p.hero__sub', `von ${money(b.perDayToday, cur)} für heute`),
    bar(usedRatio, tone),
    h('p.hero__foot',
      b.spentToday ? `${money(b.spentToday, cur)} heute schon ausgegeben` : 'heute noch nichts ausgegeben',
      b.planned ? ` · ${money(b.planned, cur)} verplant` : '',
    ),
    heroTotal(b, cur),
  );
}

/**
 * Die Tageszahl beantwortet „was geht heute noch?“ — nicht „wie viel ist
 * überhaupt noch da?“. Dafür stand bisher nur die Kachel weiter unten; hier
 * steht die Summe direkt unter der großen Zahl, abgesetzt durch eine Linie,
 * damit sie ihr nicht die Aufmerksamkeit klaut.
 */
function heroTotal(b, cur) {
  return h('div.hero__total', { class: b.free < 0 ? 'hero__total--over' : '' },
    h('span.hero__total-label', 'Insgesamt verfügbar'),
    h('span.hero__total-value', money(b.free, cur)),
    h('span.hero__total-note', `von ${money(b.total, cur)} in der Kasse`),
  );
}
