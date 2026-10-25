import type { LegalTexts } from './types'

export const en: LegalTexts = {
  updated: 'Version of 25 October 2026',
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
          'You can use Chatter as a guest, create an account with a username and password, or use an enabled Google, Facebook or Discord connection. Your profile lets you manage your password and linked sign-in methods. An account keeps your profile and preferences across browsers. Login usernames are unique and private; display names can be shared, and public identity tags distinguish people with the same name.',
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
          'Your nickname, avatar picture, gender and any birth date or age you provide. Your public profile and age are shown to others; your full birth date and login username are not. A birth date is used to calculate your age.',
          'Messages in public rooms and their reactions. A bounded recent history is kept in Redis so people who join can catch up; older messages are trimmed and the history expires one hour after the room’s last message by default. Reported messages may be retained separately as described below.',
          'Private messages. They are passed on to the other person and are not stored on the server. They stay in your browser tab until you close it.',
          'A hash of your IP address: a scrambled value made with a secret key, which we use to limit connections, to enforce bans and to count reports. It is kept with your messages for about an hour, and in a ban for as long as the ban lasts. We cannot turn it back into your address.',
          'Your IP address itself, while you are connected. It may also appear in the server’s technical logs (for example in connection errors). The logs are rotated automatically and used only to keep the service running.',
          'Reports. When a message is reported we keep a copy (the text, the nickname, the hash of the sender’s address and the reasons given) for at most 90 days, so that it can be reviewed.',
          'Staff accounts: email address, profile, permissions, linked sign-in methods and a password hash when a password is set.',
          'Member accounts: username, display name, picture, gender, birth date or age, saved preferences, profile-change timestamps and last sign-in time. A password account stores a cryptographic password hash, not the password itself. Linked providers add their name, your identifier there and any email address they supply. Email addresses are not public. We never receive your password at Google, Facebook or Discord.',
        ],
      },
      {
        heading: 'What is stored in your browser',
        paragraphs: [
          'Chatter runs no advertising or analytics. Local storage keeps language, guest display and sound choices, accepted terms and saved account authentication. Session storage keeps this tab’s chat identity, recovery secret, private conversations and blocks. Account sound and sidebar preferences are also saved in the database. Browser storage can be removed through your browser settings.',
          'Unsaved message drafts, attachments, searches and non-password form fields are kept in this tab’s session storage for reload recovery. Draft entries expire after eight hours and are cleared on sign-out or authentication changes. Passwords are not saved as drafts. Closing the tab clears its session storage. Non-sensitive view choices, such as an open menu, may appear in the page address; passwords and message drafts do not.',
        ],
      },
      {
        heading: 'GIFs',
        paragraphs: [
          'When you search for GIFs, your search words and your IP address go to GIPHY. GIFs in messages are loaded from GIPHY, which then also sees your IP address. See GIPHY’s own privacy policy.',
        ],
      },
      {
        heading: 'YouTube and human verification',
        paragraphs: [
          'YouTube thumbnails load from i.ytimg.com and expose your IP address to YouTube. Players load from www.youtube-nocookie.com without autoplay; loading a player sends connection data, including your IP address and referring origin, to YouTube. YouTube’s privacy policy applies.',
          'When enabled, Cloudflare Turnstile checks that guest entry and password sign-in requests come from a person. Your browser contacts Cloudflare and supplies connection and device information under Cloudflare’s privacy policy. Chatter validates the short-lived verification token on the server; the secret verification key is never sent to your browser.',
        ],
      },
      {
        heading: 'Who else handles data',
        paragraphs: [
          'We use Cloudflare for website hosting, database backups in R2 and Turnstile when enabled, and Oracle Cloud for the server in Frankfurt, Germany. Backups contain accounts, preferences, rooms, bans, reports and legal text, but not Redis room history or private messages. GIPHY and YouTube are described above.',
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
          'Browser local storage: until removed or cleared by the app; session storage: until the tab closes, with draft entries also expiring after eight hours.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can ask to see, correct or delete your data, to limit how we use it, and to object to it. If you have an account you can delete it yourself in your profile. Write to {contact}. Some records are identified only by a salted hash, so we may need context such as when and where you used the chat to find them.',
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
