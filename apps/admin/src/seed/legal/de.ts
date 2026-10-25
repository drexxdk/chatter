import type { LegalTexts } from './types'

export const de: LegalTexts = {
  updated: 'Stand: 25. Oktober 2026',
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
          'Du kannst Chatter als Gast nutzen, ein Konto mit Benutzername und Passwort erstellen oder eine aktivierte Verbindung zu Google, Facebook oder Discord verwenden. Im Profil verwaltest du Passwort und verknüpfte Anmeldemethoden. Ein Konto behält Profil und Einstellungen über Browser hinweg. Anmeldebenutzernamen sind eindeutig und privat; Anzeigenamen können mehrfach vorkommen, und öffentliche Identitätskennungen unterscheiden Personen mit gleichem Namen.',
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
          'Deinen Spitznamen, dein Avatarbild, Geschlecht und gegebenenfalls Geburtsdatum oder Alter. Dein öffentliches Profil und Alter werden anderen angezeigt; dein vollständiges Geburtsdatum und dein Anmeldebenutzername nicht. Ein Geburtsdatum dient zur Berechnung des Alters.',
          'Nachrichten in öffentlichen Räumen und ihre Reaktionen. Ein begrenzter aktueller Verlauf bleibt in Redis, damit neu Hinzugekommene nachlesen können. Ältere Nachrichten werden entfernt; standardmäßig verfällt der Verlauf eine Stunde nach der letzten Raumnachricht. Gemeldete Nachrichten können wie unten beschrieben separat aufbewahrt werden.',
          'Private Nachrichten. Sie werden an die andere Person weitergeleitet und nicht auf dem Server gespeichert. Sie bleiben in deinem Browser-Tab, bis du ihn schließt.',
          'Einen Hashwert deiner IP-Adresse: ein verfremdeter Wert, der mit einem geheimen Schlüssel erzeugt wird und mit dem wir Verbindungen begrenzen, Sperren durchsetzen und Meldungen zählen. Er wird etwa eine Stunde mit deinen Nachrichten gespeichert und in einer Sperre, solange sie gilt. Wir können ihn nicht in deine Adresse zurückverwandeln.',
          'Deine IP-Adresse selbst, solange du verbunden bist. Sie kann auch in den technischen Protokollen des Servers auftauchen (zum Beispiel bei Verbindungsfehlern). Die Protokolle werden automatisch rotiert und nur genutzt, um den Dienst am Laufen zu halten.',
          'Meldungen. Wird eine Nachricht gemeldet, bewahren wir eine Kopie auf (den Text, den Spitznamen, den Hashwert der Adresse des Absenders und die genannten Gründe), höchstens 90 Tage lang, damit sie geprüft werden kann.',
          'Personalkonten: E-Mail-Adresse, Profil, Berechtigungen, verknüpfte Anmeldemethoden und gegebenenfalls ein Passwort-Hash.',
          'Mitgliedskonten: Benutzername, Anzeigename, Bild, Geschlecht, Geburtsdatum oder Alter, gespeicherte Einstellungen, Zeitpunkte von Profiländerungen und letzter Anmeldung. Passwortkonten speichern einen kryptografischen Hash, nicht das Passwort selbst. Verknüpfte Anbieter ergänzen ihren Namen, deine Kennung dort und gegebenenfalls eine E-Mail-Adresse. E-Mail-Adressen sind nicht öffentlich. Dein Passwort bei Google, Facebook oder Discord erhalten wir nie.',
        ],
      },
      {
        heading: 'Was in deinem Browser gespeichert wird',
        paragraphs: [
          'Chatter verwendet keine Werbung oder Analysedienste. Der lokale Speicher hält Sprache, Anzeige- und Tonwahl von Gästen, akzeptierte Bedingungen und gespeicherte Kontoanmeldung. Der Sitzungsspeicher hält Chatidentität, Wiederherstellungsgeheimnis, private Unterhaltungen und Blockierungen dieses Tabs. Ton- und Seitenleisteneinstellungen von Konten liegen auch in der Datenbank. Browserspeicher lässt sich über die Browsereinstellungen entfernen.',
          'Ungesendete Nachrichten, Anhänge, Suchen und Formularfelder ohne Passwörter werden im Sitzungsspeicher dieses Tabs zur Wiederherstellung nach Neuladen gehalten. Entwürfe verfallen nach acht Stunden und werden bei Abmeldung oder geänderter Anmeldung gelöscht. Passwörter werden nicht als Entwürfe gespeichert. Das Schließen des Tabs löscht dessen Sitzungsspeicher. Nicht vertrauliche Ansichtsoptionen wie ein offenes Menü können in der Seitenadresse stehen; Passwörter und Nachrichtenentwürfe nicht.',
        ],
      },
      {
        heading: 'GIFs',
        paragraphs: [
          'Wenn du nach GIFs suchst, gehen deine Suchbegriffe und deine IP-Adresse an GIPHY. GIFs in Nachrichten werden von GIPHY geladen, das dabei ebenfalls deine IP-Adresse sieht. Siehe die Datenschutzerklärung von GIPHY.',
        ],
      },
      {
        heading: 'YouTube und Prüfung menschlicher Nutzung',
        paragraphs: [
          'YouTube-Vorschaubilder laden von i.ytimg.com und übermitteln deine IP-Adresse an YouTube. Player laden ohne automatische Wiedergabe von www.youtube-nocookie.com; dabei gehen Verbindungsdaten einschließlich IP-Adresse und verweisender Herkunft an YouTube. YouTubes Datenschutzerklärung gilt.',
          'Wenn aktiviert, prüft Cloudflare Turnstile menschliche Nutzung beim Gastzugang und bei Passwortanmeldungen. Dein Browser kontaktiert Cloudflare und übermittelt Verbindungs- und Geräteinformationen gemäß Cloudflares Datenschutzerklärung. Chatter validiert den kurzlebigen Prüfungsnachweis auf dem Server; der geheime Prüfschlüssel wird nie an deinen Browser gesendet.',
        ],
      },
      {
        heading: 'Wer sonst Daten verarbeitet',
        paragraphs: [
          'Wir nutzen Cloudflare für Websitehosting, Datenbanksicherungen in R2 und gegebenenfalls Turnstile sowie Oracle Cloud für den Server in Frankfurt, Deutschland. Sicherungen enthalten Konten, Einstellungen, Räume, Sperren, Meldungen und Rechtstexte, aber keinen Redis-Raumverlauf und keine privaten Nachrichten. GIPHY und YouTube sind oben beschrieben.',
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
          'Lokaler Browserspeicher: bis er entfernt oder von der App gelöscht wird. Sitzungsspeicher: bis der Tab schließt; Entwürfe verfallen zusätzlich nach acht Stunden.',
        ],
      },
      {
        heading: 'Deine Rechte',
        paragraphs: [
          'Du kannst Auskunft über deine Daten verlangen, sie berichtigen oder löschen lassen, ihre Nutzung einschränken lassen und widersprechen. Hast du ein Konto, kannst du es selbst in deinem Profil löschen. Schreibe an {contact}. Manche Einträge sind nur durch einen gesalzenen Hash identifiziert; um sie zu finden, benötigen wir möglicherweise Angaben dazu, wann und wo du den Chat genutzt hast.',
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
