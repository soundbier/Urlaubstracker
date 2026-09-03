/**
 * Datenschutz: was die App verarbeitet, wo es liegt, wie lange.
 *
 * Solange eine Kasse nur im Kreis der eigenen Familie oder Freunde läuft,
 * greift die Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO) und die Pflichten
 * unten sind Kür. Sobald die Seite aber für wechselnde oder größere Gruppen
 * bereitgestellt wird, ist der Betreiber des Firebase-Projekts Verantwortlicher
 * — dann braucht es die Angaben aus Art. 13 DSGVO, und zwar dort, wo die Leute
 * sind: in der App. Deshalb steht der Text hier als Daten und nicht nur in der
 * README, die im Urlaub niemand liest.
 *
 * Hier stehen bewusst nur Text und Regionsdaten, keine Oberfläche — gezeigt
 * wird das in `views/settings.js`.
 */

// ------------------------------------------------------------ Speicherort

/**
 * Firestore-Standorte. Entscheidend ist die Spalte `eu`: liegt die Datenbank
 * außerhalb der EU/des EWR, ist jede Eingabe eine Übermittlung in ein Drittland
 * (Art. 44 ff. DSGVO) — dann braucht es eine Grundlage dafür, und die Leute
 * müssen es wissen.
 *
 * Die Liste ist die Auswahl aus der Firebase-Konsole, gekürzt auf das, was
 * jemand für eine Urlaubskasse realistisch anlegt. `other` fängt den Rest.
 */
export const REGIONS = [
  ['eur3', 'Europa (eur3, multi-region)', true],
  ['europe-west1', 'Belgien (europe-west1)', true],
  ['europe-west3', 'Frankfurt (europe-west3)', true],
  ['europe-west4', 'Niederlande (europe-west4)', true],
  ['europe-west6', 'Zürich (europe-west6)', false], // Schweiz: kein EWR, aber Angemessenheitsbeschluss
  ['europe-west9', 'Paris (europe-west9)', true],
  ['europe-north1', 'Finnland (europe-north1)', true],
  ['nam5', 'USA (nam5, multi-region)', false],
  ['us-central1', 'USA (us-central1)', false],
  ['other', 'Andere Region außerhalb der EU', false],
];

/** Voreinstellung überall dort, wo wir raten müssen — und die Empfehlung. */
export const RECOMMENDED_REGION = 'eur3';

export function regionLabel(id) {
  const row = REGIONS.find(([key]) => key === id);
  return row ? row[1] : 'Nicht angegeben';
}

/** Liegt die Datenbank in der EU/im EWR? `null`, solange niemand es gesagt hat. */
export function isEuRegion(id) {
  const row = REGIONS.find(([key]) => key === id);
  if (!row) return null;
  return row[2];
}

/**
 * Der Satz, den die Einstellungen zum Speicherort zeigen.
 *
 * Drei Fälle, drei Töne: EU ist in Ordnung, die Schweiz ist ein Sonderfall mit
 * Angemessenheitsbeschluss, alles andere ist eine Drittlandübermittlung — und
 * „weiß nicht“ ist keine Antwort, die man stehen lassen sollte.
 */
export function regionAdvice(id) {
  const eu = isEuRegion(id);
  if (eu === null) {
    return {
      tone: 'warn',
      title: 'Speicherort nicht angegeben',
      text: 'In welcher Region liegt die Firestore-Datenbank? Ohne diese Angabe lässt sich nicht sagen, ob die Daten die EU verlassen.',
    };
  }
  if (id === 'europe-west6') {
    return {
      tone: 'good',
      title: 'Schweiz',
      text: 'Die Schweiz liegt außerhalb des EWR, die EU-Kommission hat ihr aber ein angemessenes Datenschutzniveau bescheinigt. Eine Übermittlung ist damit zulässig.',
    };
  }
  if (eu) {
    return {
      tone: 'good',
      title: 'Daten bleiben in der EU',
      text: `Die Kasse liegt in ${regionLabel(id)}. Damit verlassen die Einträge den EWR nicht.`,
    };
  }
  return {
    tone: 'over',
    title: 'Daten liegen außerhalb der EU',
    text: `Die Kasse liegt in ${regionLabel(id)}. Das ist eine Übermittlung in ein Drittland (Art. 44 ff. DSGVO). Für eine private Runde ist das meist unkritisch; sobald andere dazukommen, gehört es in die Datenschutzerklärung — oder die Datenbank wird in einer EU-Region neu angelegt (die Region einer bestehenden Firestore-Datenbank lässt sich nicht ändern).`,
  };
}

// ------------------------------------------------------------ Aufbewahrung

/**
 * Nach so vielen Tagen ab Urlaubsende erinnert die App ans Aufräumen.
 *
 * Sechs Wochen: lang genug, dass die letzte Abrechnung und eine
 * Rückerstattung durch sind, kurz genug, dass niemand jahrelang Ausgaben
 * fremder Leute mit sich herumträgt (Art. 5 Abs. 1 lit. e DSGVO —
 * Speicherbegrenzung).
 */
export const RETENTION_DAYS = 42;

/**
 * Ist die Kasse abgelaufen und sollte weg? Gibt die Zahl der Tage seit dem
 * Stichtag zurück, sonst `null`.
 */
export function retentionOverdue(endDate, today = new Date()) {
  if (!endDate) return null;
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const now = today instanceof Date ? today.getTime() : Date.parse(today);
  const days = Math.floor((now - end) / 86400000);
  return days > RETENTION_DAYS ? days : null;
}

// ------------------------------------------------- Text der Erklärung

/**
 * Die Angaben nach Art. 13 DSGVO, als Abschnitte.
 *
 * Der Verantwortliche steht nicht fest: das ist, wer die Seite bereitstellt
 * und das Firebase-Projekt betreibt. Steht in `firebase-config.json` ein
 * `privacyContact`, zeigen wir ihn; sonst sagen wir ehrlich, dass die Stelle
 * noch auszufüllen ist, statt eine Erklärung vorzutäuschen, die niemanden
 * benennt.
 */
export function privacySections({ contact = '', region = null, mode = 'local' } = {}) {
  const cloud = mode === 'cloud';
  const advice = regionAdvice(region);

  return [
    {
      title: 'Verantwortlich',
      text: contact
        ? `Verantwortlich im Sinne von Art. 4 Nr. 7 DSGVO ist ${contact} — wer diese Seite bereitstellt und das Firebase-Projekt betreibt.`
        : 'Verantwortlich im Sinne von Art. 4 Nr. 7 DSGVO ist, wer diese Seite bereitstellt und das Firebase-Projekt betreibt. In dieser Installation ist dazu nichts hinterlegt: Wer die Kasse für andere aufsetzt, trägt seine Kontaktdaten in die Firebase-Konfiguration ein (Feld „privacyContact“).',
    },
    {
      title: 'Was verarbeitet wird',
      text: 'Namen der Teilnehmenden (frei wählbar, ein Spitzname reicht), Einzahlungen, Ausgaben mit Datum, Kategorie und Notiz, Auszahlungen sowie Zeitraum und Währung der Kasse. Dazu geräteeigene Einstellungen (Aussehen, wer an diesem Gerät sitzt) im Speicher des Browsers.',
    },
    {
      title: 'Wozu und auf welcher Grundlage',
      text: cloud
        ? 'Zweck ist allein das gemeinsame Führen der Urlaubskasse. Grundlage ist die Einwilligung der Beteiligten (Art. 6 Abs. 1 lit. a DSGVO), die mit dem Beitritt zur Kasse erteilt und durch Verlassen oder Löschen widerrufen wird.'
        : 'Zweck ist allein das Führen der Urlaubskasse. Solange nichts geteilt ist, bleiben alle Daten auf diesem Gerät; sie werden nirgendwohin übertragen.',
    },
    {
      title: 'Wer die Daten sieht',
      text: cloud
        ? 'Alle Geräte, die Name und Passwort der Kasse kennen. Als Auftragsverarbeiter (Art. 28 DSGVO) kommt Google Ireland Ltd. mit Firebase/Firestore hinzu; die Auftragsverarbeitung ist im Google-Cloud-Datenverarbeitungszusatz geregelt, den der Betreiber des Projekts akzeptieren muss. Eine Weitergabe darüber hinaus findet nicht statt — die App enthält keine Werbung, kein Tracking und keine Analyse.'
        : 'Niemand. Ohne Synchronisierung verlässt kein Eintrag dieses Gerät. Die App enthält keine Werbung, kein Tracking und keine Analyse.',
    },
    {
      title: 'Wo die Daten liegen',
      text: cloud
        ? `${advice.title}: ${advice.text}`
        : 'Im Speicher dieses Browsers (IndexedDB und localStorage). Auf keinem Server.',
    },
    {
      title: 'Wie lange',
      text: `So lange die Kasse besteht — automatisch gelöscht wird nichts. Empfohlen ist, sie spätestens ${RETENTION_DAYS} Tage nach dem letzten Urlaubstag zu löschen; die App erinnert daran. „Urlaubskasse löschen“ entfernt ${
        cloud ? 'den Trip mit allen Einträgen für alle Geräte' : 'alle Einträge auf diesem Gerät'
      }. Vorher lässt sich alles als Sicherungskopie oder CSV mitnehmen.`,
    },
    {
      title: 'Eure Rechte',
      text: 'Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie Beschwerde bei einer Aufsichtsbehörde. Auskunft und Übertragbarkeit deckt „Als CSV“ bzw. „Sicherungskopie speichern“ ab, Berichtigung jede Bearbeitung eines Eintrags, Löschung „Urlaubskasse löschen“.',
    },
  ];
}
