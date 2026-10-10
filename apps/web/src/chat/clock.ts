// How a time of day is written. A 12-hour clock with AM and PM is for those whose locale uses one; everybody else gets the
// 24-hour clock. The chat's own language decides when it is not English (Dansk and Deutsch are 24-hour), and for English
// the browser's languages and the time zone say where the guest is: a time zone in Europe or Africa, or an English locale
// of a 24-hour country such as en-DK or en-GB among their languages, means a 24-hour clock, while an American browser in
// an American time zone keeps AM and PM.
export interface Clock {
  locale: string;
  hourCycle?: "h23";
}

function uses24Hours(locale: string): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
    }).resolvedOptions().hourCycle;

    return cycle === "h23" || cycle === "h24";
  } catch {
    return false;
  }
}

const isEnglish = (locale: string) => /^en(-|$)/i.test(locale);

export function clockFor(
  language: string | undefined,
  languages: readonly string[],
  timeZone: string | undefined,
): Clock {
  if (language && !isEnglish(language)) return { locale: language };

  const first = languages[0] ?? language ?? "en";
  if (uses24Hours(first)) return { locale: first };

  const english24 = languages.find(
    (locale) => isEnglish(locale) && uses24Hours(locale),
  );
  if (english24) return { locale: english24 };

  return /^(Europe|Africa)\//.test(timeZone ?? "")
    ? { locale: first, hourCycle: "h23" }
    : { locale: first };
}

export function formatClock(
  sentAt: string,
  language: string | undefined,
  languages: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages,
  timeZone: string | undefined = Intl.DateTimeFormat().resolvedOptions()
    .timeZone,
): string {
  const { locale, hourCycle } = clockFor(language, languages, timeZone);

  return new Date(sentAt).toLocaleTimeString(
    locale,
    hourCycle ? { hourCycle } : undefined,
  );
}
