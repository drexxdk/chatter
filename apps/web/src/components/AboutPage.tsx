import {
  Activity,
  Database,
  Globe,
  HardDrive,
  LayoutDashboard,
  MessagesSquare,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CONTACT_EMAIL, SOURCE_URL } from "../config";
import { Breadcrumb } from "./Breadcrumb";
import { ButtonLink } from "./Button";
import { LegalLinks, LINK } from "./LegalLinks";

const PARTS: { id: string; icon: LucideIcon }[] = [
  { id: "website", icon: Globe },
  { id: "chat", icon: MessagesSquare },
  { id: "redis", icon: Zap },
  { id: "admin", icon: LayoutDashboard },
  { id: "postgres", icon: Database },
  { id: "server", icon: Server },
  { id: "backups", icon: HardDrive },
  { id: "monitoring", icon: Activity },
];

const JOURNEY = ["write", "check", "keep", "deliver"];
const DATA = [
  "messages",
  "private",
  "guest",
  "account",
  "address",
  "reports",
  "backups",
];
const SAFETY = [
  "limits",
  "reports",
  "bans",
  "age",
  "passwords",
  "thirdParties",
  "headers",
];
const LIMITS = ["hobby", "public", "law"];

// The names of the things it is built with are the products' own, the same in every language.
const STACK: { id: string; items: string[] }[] = [
  {
    id: "web",
    items: [
      "React",
      "TypeScript",
      "Vite",
      "Tailwind CSS",
      "Headless UI",
      "Floating UI",
      "Motion",
      "Lucide",
      "i18next",
      "TipTap",
      "DiceBear",
      "Emoji Mart",
      "GIPHY",
    ],
  },
  {
    id: "server",
    items: ["Node.js", "Express", "Socket.IO", "Redis", "zod"],
  },
  { id: "admin", items: ["Payload CMS", "Next.js", "PostgreSQL"] },
  {
    id: "hosting",
    items: [
      "Docker Compose",
      "Caddy",
      "Oracle Cloud",
      "Cloudflare Pages",
      "Cloudflare R2",
      "GitHub Actions",
      "UptimeRobot",
    ],
  },
  { id: "tests", items: ["Vitest", "Testing Library", "Playwright"] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// How the site is built and where the data goes, for the owner to understand it and for anybody who wants to judge
// whether to trust it. It says only what is true of what runs. (The tab's title is the app's; see App.)
export function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb title={t("about.title")} />

      <article className="space-y-8 text-neutral-200">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("about.title")}</h1>
          <p className="text-neutral-300">{t("about.lead")}</p>
        </div>

        <Section title={t("about.partsTitle")}>
          <p className="text-sm text-neutral-400">{t("about.partsIntro")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PARTS.map(({ id, icon: Icon }) => (
              <li
                key={id}
                className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-indigo-300"
                  />
                  <h3 className="font-medium">{t(`about.parts.${id}.name`)}</h3>
                </div>
                <p className="text-xs text-neutral-400">
                  {t(`about.parts.${id}.tech`)}
                </p>
                <p className="text-sm text-neutral-300">
                  {t(`about.parts.${id}.text`)}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("about.journeyTitle")}>
          <ol className="space-y-2">
            {JOURNEY.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-200">
                  {index + 1}
                </span>
                <span>{t(`about.journey.${step}`)}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-neutral-300">
            {t("about.journeyPrivate")}
          </p>
        </Section>

        <Section title={t("about.dataTitle")}>
          <p className="text-sm text-neutral-400">{t("about.dataIntro")}</p>
          <ul className="space-y-3">
            {DATA.map((id) => (
              <li
                key={id}
                className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
              >
                <h3 className="font-medium">{t(`about.data.${id}.what`)}</h3>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_1fr]">
                  <dt className="text-neutral-400">
                    {t("about.dataLabels.where")}
                  </dt>
                  <dd>{t(`about.data.${id}.where`)}</dd>
                  <dt className="text-neutral-400">
                    {t("about.dataLabels.howLong")}
                  </dt>
                  <dd>{t(`about.data.${id}.howLong`)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("about.safetyTitle")}>
          <ul className="list-disc space-y-2 pl-6">
            {SAFETY.map((id) => (
              <li key={id}>{t(`about.safety.${id}`)}</li>
            ))}
          </ul>
        </Section>

        <Section title={t("about.buildTitle")}>
          <p>{t("about.build")}</p>
          <ButtonLink href={SOURCE_URL} target="_blank" rel="noopener">
            {t("about.source")}
          </ButtonLink>
        </Section>

        <Section title={t("about.stackTitle")}>
          <dl className="space-y-3">
            {STACK.map(({ id, items }) => (
              <div key={id} className="space-y-1">
                <dt className="text-sm text-neutral-400">
                  {t(`about.stack.${id}`)}
                </dt>
                <dd>
                  <ul className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-neutral-700 px-3 py-1 text-sm"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t("about.limitsTitle")}>
          <ul className="list-disc space-y-2 pl-6">
            {LIMITS.map((id) => (
              <li key={id}>{t(`about.limits.${id}`)}</li>
            ))}
          </ul>
          <p>
            {t("about.contactLead")}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </article>

      <LegalLinks />
    </div>
  );
}
