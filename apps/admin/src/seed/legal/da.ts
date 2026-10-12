import type { LegalTexts } from './types'

export const da: LegalTexts = {
  updated: 'Version fra 12. oktober 2026',
  terms: {
    title: 'Brugsvilkår',
    sections: [
      {
        heading: 'Hvad Chatter er',
        paragraphs: [
          'Chatter er en gratis chat, som en privatperson driver som hobby (“vi”). Du kan chatte i offentlige rum under et kaldenavn og skrive privat til andre, der er i det samme rum.',
          'Disse vilkår gælder, når du bruger Chatter. Når du sætter flueben og fortsætter, accepterer du dem og privatlivspolitikken.',
        ],
      },
      {
        heading: 'Hvem må bruge den',
        paragraphs: [
          'Chatter er kun for personer på 18 år eller derover. Er du yngre, må du ikke bruge den. Vi kan fjerne enhver, vi tror er under 18.',
        ],
      },
      {
        heading: 'Regler',
        paragraphs: ['Du må ikke:'],
        items: [
          'skrive eller dele noget, der er ulovligt;',
          'true, chikanere eller mobbe andre, eller sprede had mod personer eller grupper;',
          'dele seksuelt indhold eller noget seksuelt, der involverer mindreårige (det anmelder vi til politiet);',
          'dele andres personlige oplysninger eller forsøge at finde ud af, hvem nogen er;',
          'sende spam, reklamer eller svindel eller oversvømme et rum med beskeder;',
          'give dig ud for at være moderator eller en anden;',
          'bruge bots eller scripts eller forsøge at ødelægge, overbelaste eller omgå tjenesten eller dens grænser.',
        ],
      },
      {
        heading: 'Det, du skriver',
        paragraphs: [
          'Du er ansvarlig for det, du skriver. En besked i et offentligt rum kan læses af alle i rummet og af dem, der kommer ind i den næste times tid. Andre kan kopiere den eller tage et skærmbillede.',
          'En privat besked går igennem vores server og gemmes ikke dér, men den, du skriver til, kan stadig kopiere den.',
          'Del ikke personlige oplysninger som dit rigtige navn, din adresse eller dit telefonnummer. Vi læser ikke beskeder som rutine, men vi kan se på det, der er blevet anmeldt.',
        ],
      },
      {
        heading: 'Anmeldelser og moderation',
        paragraphs: [
          'Alle kan anmelde en besked. Når nok forskellige personer har anmeldt den, skjules den, til den er blevet gennemgået. Moderatorer og vi kan skjule beskeder, afbryde forbindelsen og udelukke personer uden varsel.',
          'En udelukkelse gælder en netværksadresse, så den kan også ramme andre, der bruger den samme. Mener du, at en udelukkelse eller fjernelse var forkert, så skriv til {contact}. Vi afgør, om den ophæves.',
        ],
      },
      {
        heading: 'Ingen garantier',
        paragraphs: [
          'Chatter tilbydes, som den er. Den kan være nede, ændres eller lukkes når som helst uden varsel, og beskeder kan forsvinde.',
          'Så vidt loven tillader det, er vi ikke ansvarlige for det, brugerne skriver, eller for tab ved at bruge Chatter eller ved ikke at kunne bruge den. Det begrænser ikke noget, som loven ikke lader os begrænse.',
        ],
      },
      {
        heading: 'Ændringer og lov',
        paragraphs: [
          'Vi kan ændre disse vilkår. Datoen for den gældende version står øverst. Ændrer vi dem på en måde, der har betydning, bliver du bedt om at acceptere dem igen.',
          'Dansk ret gælder. Dine rettigheder som forbruger i det land, hvor du bor, berøres ikke.',
        ],
      },
      {
        heading: 'Kontakt',
        paragraphs: ['Spørgsmål, anmeldelser og henvendelser: {contact}.'],
      },
    ],
  },
  privacy: {
    title: 'Privatlivspolitik',
    sections: [
      {
        heading: 'Hvem er ansvarlig',
        paragraphs: [
          'Den person, der driver Chatter (“vi”), er ansvarlig for dine oplysninger. Kontakt: {contact}.',
        ],
      },
      {
        heading: 'Hvad vi behandler, og hvorfor',
        items: [
          'Dit kaldenavn, din avatar og, hvis du vælger at oplyse den, din alder. De vises for de andre i rummet.',
          'Beskeder i offentlige rum. De vises for rummet og gemmes i serverens hukommelse i cirka en time, så dem, der kommer ind, kan følge med. Derefter slettes de.',
          'Private beskeder. De sendes videre til den anden person og gemmes ikke på serveren. De bliver i din browserfane, til du lukker den.',
          'En hashværdi af din IP-adresse: en forvansket værdi lavet med en hemmelig nøgle, som vi bruger til at begrænse forbindelser, håndhæve udelukkelser og tælle anmeldelser. Den gemmes sammen med dine beskeder i cirka en time og i en udelukkelse, så længe den varer. Vi kan ikke omdanne den tilbage til din adresse.',
          'Selve din IP-adresse, mens du er forbundet. Den kan også optræde i serverens tekniske logfiler (for eksempel ved forbindelsesfejl). Logfilerne roteres automatisk og bruges kun til at holde tjenesten kørende.',
          'Anmeldelser. Når en besked anmeldes, gemmer vi en kopi (teksten, kaldenavnet, hashværdien af afsenderens adresse og de angivne grunde) i højst 90 dage, så den kan gennemgås.',
          'Kun for moderatorer: e-mailadresse, visningsnavn og en adgangskode, der gemmes i forvansket form.',
        ],
      },
      {
        heading: 'Hvad der gemmes i din browser',
        paragraphs: [
          'Der er ingen cookies og ingen sporing eller statistik. Browserens lokale lager gemmer dit sprog, dine visningsvalg og at du har accepteret vilkårene. Dens sessionslager gemmer, kun for denne fane, dit kaldenavn, din avatar og din alder, en hemmelighed, der bringer dig tilbage til rummet efter en genindlæsning, og dine private samtaler. Det slettes, når du lukker fanen.',
        ],
      },
      {
        heading: 'GIF’er',
        paragraphs: [
          'Når du søger efter GIF’er, sendes dine søgeord og din IP-adresse til GIPHY. GIF’er i beskeder hentes fra GIPHY, som så også ser din IP-adresse. Se GIPHYs egen privatlivspolitik.',
        ],
      },
      {
        heading: 'Hvem andre behandler oplysninger',
        paragraphs: [
          'Vi bruger Cloudflare (hjemmesidens filer og sikkerhedskopier af administrationsdatabasen, som indeholder moderatorkonti og anmeldelser, men ingen chatbeskeder) og Oracle Cloud (serveren, i Frankfurt i Tyskland). GIPHY er beskrevet ovenfor.',
          'Vi sælger ikke oplysninger og bruger dem ikke til reklamer. Vi videregiver oplysninger til myndighederne, når loven kræver det.',
        ],
      },
      {
        heading: 'Vores retsgrundlag',
        paragraphs: [
          'At drive og beskytte chatten er vores legitime interesse (databeskyttelsesforordningens artikel 6, stk. 1, litra f). At søge efter og se GIF’er er dit eget valg.',
        ],
      },
      {
        heading: 'Hvor længe vi gemmer det',
        items: [
          'Offentlige beskeder og adressens hashværdi sammen med dem: cirka en time.',
          'En udelukkelse: til den udløber eller ophæves.',
          'En anmeldelse: højst 90 dage.',
          'Sikkerhedskopier af databasen: 30 dage.',
          'Tekniske logfiler: til de roteres væk.',
          'Det, der er i din browser: til du sletter det eller lukker fanen.',
        ],
      },
      {
        heading: 'Dine rettigheder',
        paragraphs: [
          'Du kan bede om indsigt i, berigtigelse eller sletning af dine oplysninger, om at vi begrænser brugen af dem, og gøre indsigelse. Skriv til {contact}. Fordi vi kun gemmer anonyme værdier, kan vi muligvis ikke finde dine oplysninger, medmindre du fortæller os, hvornår og hvor du var i chatten.',
          'Du kan klage til Datatilsynet (datatilsynet.dk) eller til myndigheden i dit eget land.',
        ],
      },
      {
        heading: 'Børn',
        paragraphs: [
          'Chatter er kun for personer på 18 år eller derover. Hører vi, at en yngre har brugt den, fjerner vi det, vi har om vedkommende.',
        ],
      },
      {
        heading: 'Ændringer',
        paragraphs: ['Vi kan ændre denne politik. Datoen for den gældende version står øverst.'],
      },
    ],
  },
}
