import type { LegalTexts } from './types'

export const de: LegalTexts = {
  updated: 'Stand: 13. Oktober 2026',
  terms: {
    title: 'Nutzungsbedingungen',
    sections: [
      {
        heading: 'Was Chatter ist',
        paragraphs: [
          'Chatter ist ein kostenloser Chat, den eine Privatperson als Hobby betreibt („wir“). Du kannst in öffentlichen Räumen unter einem Spitznamen chatten und anderen, die im selben Raum sind, privat schreiben.',
          'Diese Bedingungen gelten, wenn du Chatter benutzt. Indem du das Kästchen anhakst und weitermachst, stimmst du ihnen und der Datenschutzerklärung zu.',
        ],
      },
      {
        heading: 'Wer Chatter nutzen darf',
        paragraphs: [
          'Chatter ist nur für Personen ab 18 Jahren. Wenn du jünger bist, nutze es nicht. Wir können jeden entfernen, den wir für jünger als 18 halten.',
        ],
      },
      {
        heading: 'Konten',
        paragraphs: [
          'Du kannst Chatter als Gast nutzen oder ein Konto anlegen, indem du ein Google-, Facebook- oder Discord-Konto verbindest. Ein Konto behält deinen Spitznamen, deinen Avatar und dein Alter, damit du aus jedem Browser als dieselbe Person zurückkommen kannst, und der Spitzname gehört dir allein.',
          'Du bist für das verantwortlich, was unter deinem Konto getan wird. Du kannst es jederzeit in deinem Profil löschen. Wir können ein Konto oder einen Spitznamen entfernen, der gegen diese Bedingungen verstößt oder so aussieht, als gehöre er zum Personal oder zu jemand anderem.',
        ],
      },
      {
        heading: 'Regeln',
        paragraphs: ['Du darfst nicht:'],
        items: [
          'etwas schreiben oder teilen, das rechtswidrig ist;',
          'Menschen bedrohen, belästigen oder mobben oder Hass gegen Menschen oder Gruppen verbreiten;',
          'sexuelle Inhalte teilen oder etwas Sexuelles, das Minderjährige betrifft (das zeigen wir bei der Polizei an);',
          'persönliche Daten anderer weitergeben oder herauszufinden versuchen, wer jemand ist;',
          'Spam, Werbung oder Betrug verschicken oder einen Raum mit Nachrichten überfluten;',
          'so tun, als wärst du ein Moderator oder jemand anderes;',
          'Bots oder Skripte nutzen oder versuchen, den Dienst oder seine Grenzen zu stören, zu überlasten oder zu umgehen.',
        ],
      },
      {
        heading: 'Was du schreibst',
        paragraphs: [
          'Du bist für das verantwortlich, was du schreibst. Eine Nachricht in einem öffentlichen Raum können alle im Raum lesen und alle, die in der nächsten Stunde oder so hinzukommen. Andere können sie kopieren oder einen Screenshot machen.',
          'Eine private Nachricht läuft über unseren Server und wird dort nicht gespeichert, aber die Person, der du schreibst, kann sie trotzdem kopieren.',
          'Gib keine persönlichen Daten wie deinen echten Namen, deine Adresse oder deine Telefonnummer weiter. Wir lesen Nachrichten nicht routinemäßig, können uns aber ansehen, was gemeldet wurde.',
        ],
      },
      {
        heading: 'Meldungen und Moderation',
        paragraphs: [
          'Jeder kann eine Nachricht melden. Haben genug verschiedene Personen sie gemeldet, wird sie ausgeblendet, bis sie geprüft wurde. Moderatoren und wir können Nachrichten ausblenden, Verbindungen trennen und Personen ohne Vorwarnung sperren.',
          'Eine Sperre gilt für eine Netzwerkadresse oder, bei einem Konto, für das Konto und kann daher bei einer Adresse auch andere treffen, die dieselbe nutzen. Wenn du eine Sperre oder Entfernung für falsch hältst, schreibe an {contact}. Wir entscheiden, ob sie aufgehoben wird.',
        ],
      },
      {
        heading: 'Keine Garantien',
        paragraphs: [
          'Chatter wird so angeboten, wie es ist. Es kann jederzeit ohne Ankündigung ausfallen, sich ändern oder eingestellt werden, und Nachrichten können verschwinden.',
          'Soweit das Gesetz es erlaubt, sind wir nicht verantwortlich für das, was Nutzer schreiben, oder für Schäden dadurch, dass du Chatter nutzt oder nicht nutzen kannst. Das schränkt nichts ein, was das Gesetz uns nicht einschränken lässt.',
        ],
      },
      {
        heading: 'Änderungen und Recht',
        paragraphs: [
          'Wir können diese Bedingungen ändern. Das Datum der aktuellen Fassung steht oben. Ändern wir sie in einer Weise, die von Bedeutung ist, wirst du gebeten, sie erneut zu akzeptieren.',
          'Es gilt dänisches Recht. Deine Verbraucherrechte in dem Land, in dem du lebst, bleiben unberührt.',
        ],
      },
      {
        heading: 'Kontakt',
        paragraphs: ['Fragen, Meldungen und Anliegen: {contact}.'],
      },
    ],
  },
  privacy: {
    title: 'Datenschutzerklärung',
    sections: [
      {
        heading: 'Wer verantwortlich ist',
        paragraphs: [
          'Die Person, die Chatter betreibt („wir“), ist für deine Daten verantwortlich. Kontakt: {contact}.',
        ],
      },
      {
        heading: 'Was wir verarbeiten, und warum',
        items: [
          'Deinen Spitznamen, deinen Avatar und, wenn du es angibst, dein Alter. Sie werden den anderen im Raum angezeigt.',
          'Nachrichten in öffentlichen Räumen. Sie werden dem Raum angezeigt und etwa eine Stunde im Arbeitsspeicher des Servers gehalten, damit Neuankömmlinge nachlesen können. Danach werden sie gelöscht.',
          'Private Nachrichten. Sie werden an die andere Person weitergeleitet und nicht auf dem Server gespeichert. Sie bleiben in deinem Browser-Tab, bis du ihn schließt.',
          'Einen Hashwert deiner IP-Adresse: ein verfremdeter Wert, der mit einem geheimen Schlüssel erzeugt wird und mit dem wir Verbindungen begrenzen, Sperren durchsetzen und Meldungen zählen. Er wird etwa eine Stunde mit deinen Nachrichten gespeichert und in einer Sperre, solange sie gilt. Wir können ihn nicht in deine Adresse zurückverwandeln.',
          'Deine IP-Adresse selbst, solange du verbunden bist. Sie kann auch in den technischen Protokollen des Servers auftauchen (zum Beispiel bei Verbindungsfehlern). Die Protokolle werden automatisch rotiert und nur genutzt, um den Dienst am Laufen zu halten.',
          'Meldungen. Wird eine Nachricht gemeldet, bewahren wir eine Kopie auf (den Text, den Spitznamen, den Hashwert der Adresse des Absenders und die genannten Gründe), höchstens 90 Tage lang, damit sie geprüft werden kann.',
          'Nur für Moderatoren: E-Mail-Adresse, Anzeigename und ein Passwort, das in verfremdeter Form gespeichert wird.',
          'Konten. Legst du ein Konto an, speichern wir, welchen Dienst du genutzt hast (Google, Facebook oder Discord), deine Kennung dort, die E-Mail-Adresse, die der Dienst uns gibt (falls er eine gibt), deinen Spitznamen, deinen Avatar und dein Alter und wann du dich zuletzt angemeldet hast. Die E-Mail-Adresse wird niemandem angezeigt und nur genutzt, um dich zu deinem Konto zu kontaktieren. Dein Passwort beim Dienst erhalten wir nie.',
        ],
      },
      {
        heading: 'Was in deinem Browser gespeichert wird',
        paragraphs: [
          'Es gibt keine Cookies und kein Tracking und keine Statistik. Der lokale Speicher des Browsers hält deine Sprache, deine Anzeigeoptionen, dass du die Bedingungen akzeptiert hast und, wenn du ein Konto hast, den Schlüssel, der dich angemeldet hält. Sein Sitzungsspeicher hält, nur für diesen Tab, deinen Spitznamen, deinen Avatar und dein Alter, ein Geheimnis, das dich nach einem Neuladen in den Raum zurückbringt, und deine privaten Unterhaltungen. Das wird gelöscht, wenn du den Tab schließt.',
        ],
      },
      {
        heading: 'GIFs',
        paragraphs: [
          'Wenn du nach GIFs suchst, gehen deine Suchbegriffe und deine IP-Adresse an GIPHY. GIFs in Nachrichten werden von GIPHY geladen, das dabei ebenfalls deine IP-Adresse sieht. Siehe die Datenschutzerklärung von GIPHY.',
        ],
      },
      {
        heading: 'Wer sonst Daten verarbeitet',
        paragraphs: [
          'Wir nutzen Cloudflare (die Dateien der Website und Sicherungen der Admin-Datenbank, die Moderatorenkonten und Meldungen enthält, aber keine Chatnachrichten) und Oracle Cloud (den Server, in Frankfurt, Deutschland). GIPHY ist oben beschrieben.',
          'Verbindest du ein Konto, sehen Google, Facebook oder Discord, dass du Chatter nutzt, und was sie uns über dich mitteilen, ist oben beschrieben. Siehe deren eigene Datenschutzerklärungen.',
          'Wir verkaufen keine Daten und nutzen sie nicht für Werbung. Wir geben Daten an Behörden weiter, wenn das Gesetz es verlangt.',
        ],
      },
      {
        heading: 'Unsere Rechtsgrundlage',
        paragraphs: [
          'Den Chat zu betreiben und zu schützen ist unser berechtigtes Interesse (DSGVO Artikel 6 Absatz 1 Buchstabe f). Nach GIFs zu suchen und sie zu sehen, ist deine Entscheidung.',
        ],
      },
      {
        heading: 'Wie lange wir Daten aufbewahren',
        items: [
          'Öffentliche Nachrichten und der Adress-Hashwert dazu: etwa eine Stunde.',
          'Eine Sperre: bis sie abläuft oder aufgehoben wird.',
          'Eine Meldung: höchstens 90 Tage.',
          'Ein Konto: bis du es in deinem Profil löschst oder uns darum bittest.',
          'Sicherungen der Datenbank: 30 Tage.',
          'Technische Protokolle: bis sie rotiert werden.',
          'Was in deinem Browser ist: bis du es löschst oder den Tab schließt.',
        ],
      },
      {
        heading: 'Deine Rechte',
        paragraphs: [
          'Du kannst Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen, ihre Nutzung einschränken lassen und widersprechen. Hast du ein Konto, kannst du es selbst in deinem Profil löschen. Schreibe an {contact}. Weil wir nur anonyme Werte speichern, können wir deine Daten möglicherweise nur finden, wenn du uns sagst, wann und wo du im Chat warst.',
          'Du kannst dich bei der dänischen Datenschutzbehörde (Datatilsynet, datatilsynet.dk) oder bei der Behörde in deinem Land beschweren.',
        ],
      },
      {
        heading: 'Kinder',
        paragraphs: [
          'Chatter ist nur für Personen ab 18 Jahren. Erfahren wir, dass eine jüngere Person es genutzt hat, entfernen wir, was wir über sie haben.',
        ],
      },
      {
        heading: 'Änderungen',
        paragraphs: [
          'Wir können diese Erklärung ändern. Das Datum der aktuellen Fassung steht oben.',
        ],
      },
    ],
  },
}
