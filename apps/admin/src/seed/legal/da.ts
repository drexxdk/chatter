import type { LegalTexts } from './types'

export const da: LegalTexts = {
  updated: 'Version fra 25. oktober 2026',
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
        heading: 'Konti',
        paragraphs: [
          'Du kan bruge Chatter som gæst, oprette en konto med brugernavn og adgangskode eller bruge en aktiveret forbindelse til Google, Facebook eller Discord. I din profil kan du administrere adgangskode og tilknyttede loginmetoder. En konto gemmer din profil og dine indstillinger på tværs af browsere. Loginbrugernavne er unikke og private; visningsnavne kan deles, og offentlige identitetsmærker skelner personer med samme navn.',
          'Du er ansvarlig for det, der gøres under din konto. Du kan slette den når som helst fra din profil. Vi kan fjerne en konto eller et kaldenavn, der bryder disse vilkår, eller som ser ud til at tilhøre personalet eller en anden.',
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
          'En udelukkelse gælder en netværksadresse eller, for en konto, kontoen, så en udelukkelse af en adresse kan også ramme andre, der bruger den samme. Mener du, at en udelukkelse eller fjernelse var forkert, så skriv til {contact}. Vi afgør, om den ophæves.',
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
          'Dit kaldenavn, avatarbillede, køn og eventuel fødselsdato eller alder. Din offentlige profil og alder vises for andre; din fulde fødselsdato og dit loginbrugernavn gør ikke. En fødselsdato bruges til at beregne din alder.',
          'Beskeder i offentlige rum og deres reaktioner. En begrænset, nyere historik gemmes i Redis, så nye deltagere kan følge med. Ældre beskeder fjernes, og historikken udløber som standard en time efter rummets seneste besked. Anmeldte beskeder kan gemmes særskilt som beskrevet nedenfor.',
          'Private beskeder. De sendes videre til den anden person og gemmes ikke på serveren. De bliver i din browserfane, til du lukker den.',
          'En hashværdi af din IP-adresse: en forvansket værdi lavet med en hemmelig nøgle, som vi bruger til at begrænse forbindelser, håndhæve udelukkelser og tælle anmeldelser. Den gemmes sammen med dine beskeder i cirka en time og i en udelukkelse, så længe den varer. Vi kan ikke omdanne den tilbage til din adresse.',
          'Selve din IP-adresse, mens du er forbundet. Den kan også optræde i serverens tekniske logfiler (for eksempel ved forbindelsesfejl). Logfilerne roteres automatisk og bruges kun til at holde tjenesten kørende.',
          'Anmeldelser. Når en besked anmeldes, gemmer vi en kopi (teksten, kaldenavnet, hashværdien af afsenderens adresse og de angivne grunde) i højst 90 dage, så den kan gennemgås.',
          'Personalekonti: e-mailadresse, profil, rettigheder, tilknyttede loginmetoder og et adgangskodehash, hvis der er valgt en adgangskode.',
          'Medlemskonti: brugernavn, visningsnavn, billede, køn, fødselsdato eller alder, gemte indstillinger, tidspunkter for profilændringer og seneste login. En adgangskodekonto gemmer et kryptografisk hash, ikke selve adgangskoden. Tilknyttede udbydere tilføjer deres navn, dit id hos dem og eventuel e-mailadresse, de leverer. E-mailadresser er ikke offentlige. Vi modtager aldrig din adgangskode hos Google, Facebook eller Discord.',
        ],
      },
      {
        heading: 'Hvad der gemmes i din browser',
        paragraphs: [
          'Chatter har ingen reklamer eller analyseværktøjer. Lokalt lager gemmer sprog, gæsters visnings- og lydvalg, accepterede vilkår og gemt kontologin. Sessionslager gemmer denne fanes chatidentitet, gendannelseshemmelighed, private samtaler og blokeringer. Kontoens lyd- og sidepanelindstillinger gemmes også i databasen. Browserlager kan slettes i browserens indstillinger.',
          'Ufærdige beskeder, vedhæftninger, søgninger og formularfelter uden adgangskoder gemmes i denne fanes sessionslager til genindlæsning. Kladder udløber efter otte timer og slettes ved logout eller ændret login. Adgangskoder gemmes ikke som kladder. Når fanen lukkes, slettes dens sessionslager. Ikke-følsomme visningsvalg, som en åben menu, kan stå i sidens adresse; adgangskoder og beskedkladder gør ikke.',
        ],
      },
      {
        heading: 'GIF’er',
        paragraphs: [
          'Når du søger efter GIF’er, sendes dine søgeord og din IP-adresse til GIPHY. GIF’er i beskeder hentes fra GIPHY, som så også ser din IP-adresse. Se GIPHYs egen privatlivspolitik.',
        ],
      },
      {
        heading: 'YouTube og menneskeverifikation',
        paragraphs: [
          'YouTube-billeder hentes fra i.ytimg.com og viser din IP-adresse til YouTube. Afspillere indlæses fra www.youtube-nocookie.com uden automatisk afspilning. Indlæsning sender forbindelsesdata, herunder IP-adresse og henvisende oprindelse, til YouTube. YouTubes privatlivspolitik gælder.',
          'Når Cloudflare Turnstile er aktiveret, kontrollerer det, at gæsteadgang og adgangskodelogin kommer fra et menneske. Din browser kontakter Cloudflare og leverer forbindelses- og enhedsoplysninger efter Cloudflares privatlivspolitik. Chatter validerer den kortlivede verifikation på serveren; den hemmelige verifikationsnøgle sendes aldrig til din browser.',
        ],
      },
      {
        heading: 'Hvem andre behandler oplysninger',
        paragraphs: [
          'Vi bruger Cloudflare til hjemmesidehosting, databasesikkerhedskopier i R2 og Turnstile, når det er aktiveret, samt Oracle Cloud til serveren i Frankfurt i Tyskland. Sikkerhedskopier indeholder konti, indstillinger, rum, udelukkelser, anmeldelser og juridiske tekster, men ikke Redis-rumhistorik eller private beskeder. GIPHY og YouTube er beskrevet ovenfor.',
          'Forbinder du en konto, ser Google, Facebook eller Discord, at du bruger Chatter, og det, de fortæller os om dig, er beskrevet ovenfor. Se deres egne privatlivspolitikker.',
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
          'En konto: til du sletter den i din profil eller beder os om det.',
          'Sikkerhedskopier af databasen: 30 dage.',
          'Tekniske logfiler: til de roteres væk.',
          'Browserens lokale lager: til det fjernes eller ryddes af appen. Sessionslager: til fanen lukkes, og kladder udløber desuden efter otte timer.',
        ],
      },
      {
        heading: 'Dine rettigheder',
        paragraphs: [
          'Du kan bede om indsigt i, berigtigelse eller sletning af dine oplysninger, om at vi begrænser brugen af dem, og gøre indsigelse. Har du en konto, kan du selv slette den i din profil. Skriv til {contact}. Nogle poster identificeres kun med et saltet hash, så vi kan have brug for oplysninger om, hvornår og hvor du brugte chatten, for at finde dem.',
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
