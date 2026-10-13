import type { LegalTexts } from './types'

export const en: LegalTexts = {
  updated: 'Version of 13 October 2026',
  terms: {
    title: 'Terms of use',
    sections: [
      {
        heading: 'What Chatter is',
        paragraphs: [
          'Chatter is a free chat that a private person runs as a hobby (“we”). You can chat in public rooms under a nickname and write privately to others who are in the same room.',
          'These terms apply when you use Chatter. By ticking the box and continuing, you accept them and the Privacy Policy.',
        ],
      },
      {
        heading: 'Who may use it',
        paragraphs: [
          'Chatter is only for people who are 18 or older. If you are younger, do not use it. We may remove anybody we think is younger than 18.',
        ],
      },
      {
        heading: 'Accounts',
        paragraphs: [
          'You can use Chatter as a guest, or make an account by connecting a Google, Facebook or Discord account. An account keeps your nickname, avatar and age, so you can come back as the same person from any browser, and the nickname is yours alone.',
          'You are responsible for what is done under your account. You can delete it at any time from your profile. We may remove an account or a nickname that breaks these terms or that looks like it belongs to staff or to somebody else.',
        ],
      },
      {
        heading: 'Rules',
        paragraphs: ['You may not:'],
        items: [
          'write or share anything that is illegal;',
          'threaten, harass or bully people, or spread hate against people or groups;',
          'share sexual content, or anything sexual that involves minors (we report that to the police);',
          'share other people’s personal information, or try to find out who somebody is;',
          'send spam, advertising or scams, or flood a room with messages;',
          'pretend to be a moderator or somebody else;',
          'use bots or scripts, or try to break, overload or get around the service or its limits.',
        ],
      },
      {
        heading: 'What you write',
        paragraphs: [
          'You are responsible for what you write. A message in a public room can be read by everybody in the room, and by those who join in the next hour or so. Others can copy it or take a screenshot.',
          'A private message passes through our server and is not stored there, but the person you write to can still copy it.',
          'Do not share personal information such as your real name, address or phone number. We do not read messages as a routine, but we may look at what has been reported.',
        ],
      },
      {
        heading: 'Reports and moderation',
        paragraphs: [
          'Anybody can report a message. When enough different people have reported it, it is hidden until it has been reviewed. Moderators and we can hide messages, disconnect people and ban them, without warning.',
          'A ban applies to a network address or, for an account, to the account, so a ban on an address can also reach other people who use the same one. If you think a ban or a removal was wrong, write to {contact}. We decide whether to lift it.',
        ],
      },
      {
        heading: 'No guarantees',
        paragraphs: [
          'Chatter is offered as it is. It may be down, change or be shut down at any time without notice, and messages may disappear.',
          'As far as the law allows, we are not responsible for what users write, or for any loss from using Chatter or not being able to use it. This does not limit anything the law does not let us limit.',
        ],
      },
      {
        heading: 'Changes and law',
        paragraphs: [
          'We may change these terms. The date of the current version is at the top. If we change them in a way that matters, you are asked to accept them again.',
          'Danish law applies. Your rights as a consumer in the country where you live are not affected.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions, reports and requests: {contact}.'],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      {
        heading: 'Who is responsible',
        paragraphs: [
          'The person who runs Chatter (“we”) is responsible for your data. Contact: {contact}.',
        ],
      },
      {
        heading: 'What we handle, and why',
        items: [
          'Your nickname, your avatar and, if you choose to give it, your age. They are shown to the others in the room.',
          'Messages in public rooms. They are shown to the room and kept in the server’s memory for about an hour, so that people who join can catch up. Then they are deleted.',
          'Private messages. They are passed on to the other person and are not stored on the server. They stay in your browser tab until you close it.',
          'A hash of your IP address: a scrambled value made with a secret key, which we use to limit connections, to enforce bans and to count reports. It is kept with your messages for about an hour, and in a ban for as long as the ban lasts. We cannot turn it back into your address.',
          'Your IP address itself, while you are connected. It may also appear in the server’s technical logs (for example in connection errors). The logs are rotated automatically and used only to keep the service running.',
          'Reports. When a message is reported we keep a copy (the text, the nickname, the hash of the sender’s address and the reasons given) for at most 90 days, so that it can be reviewed.',
          'Moderators only: email address, display name and a password that is stored in a scrambled form.',
          'Accounts. If you make an account we keep which service you used (Google, Facebook or Discord), your id there, the email address the service gives us (if it gives one), your nickname, avatar and age, and when you last signed in. The email address is not shown to anybody and is only used to contact you about your account. We never receive your password at the service.',
        ],
      },
      {
        heading: 'What is stored in your browser',
        paragraphs: [
          'There are no cookies, and no tracking or analytics. The browser’s local storage keeps your language, your display choices, that you accepted the terms and, if you have an account, the key that keeps you signed in. Its session storage keeps, for this tab only, your nickname, avatar and age, a secret that brings you back to the room after a reload, and your private conversations. That is deleted when you close the tab.',
        ],
      },
      {
        heading: 'GIFs',
        paragraphs: [
          'When you search for GIFs, your search words and your IP address go to GIPHY. GIFs in messages are loaded from GIPHY, which then also sees your IP address. See GIPHY’s own privacy policy.',
        ],
      },
      {
        heading: 'Who else handles data',
        paragraphs: [
          'We use Cloudflare (the website’s files, and backups of the admin database, which holds moderator accounts and reports but no chat messages) and Oracle Cloud (the server, in Frankfurt, Germany). GIPHY is described above.',
          'If you connect an account, Google, Facebook or Discord learn that you use Chatter, and what they tell us about you is described above. See their own privacy policies.',
          'We do not sell data and do not use it for advertising. We pass data to the authorities when the law requires it.',
        ],
      },
      {
        heading: 'Our legal basis',
        paragraphs: [
          'Running and protecting the chat is our legitimate interest (GDPR article 6(1)(f)). Searching for and seeing GIFs is your choice.',
        ],
      },
      {
        heading: 'How long we keep it',
        items: [
          'Public messages and the address hash with them: about an hour.',
          'A ban: until it runs out or is lifted.',
          'A report: at most 90 days.',
          'An account: until you delete it in your profile, or ask us to.',
          'Database backups: 30 days.',
          'Technical logs: until they are rotated out.',
          'What is in your browser: until you delete it or close the tab.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can ask to see, correct or delete your data, to limit how we use it, and to object to it. If you have an account you can delete it yourself in your profile. Write to {contact}. Because we keep only anonymous values, we may not be able to find your data unless you tell us when and where you were in the chat.',
          'You can complain to the Danish Data Protection Agency (Datatilsynet, datatilsynet.dk) or to the authority in your own country.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          'Chatter is only for people who are 18 or older. If we learn that somebody younger has used it, we remove what we hold about them.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: ['We may change this policy. The date of the current version is at the top.'],
      },
    ],
  },
}
