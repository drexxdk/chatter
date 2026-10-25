import {
  SiCaddy,
  SiCloudflare,
  SiCloudflarepages,
  SiDependabot,
  SiDicebear,
  SiDocker,
  SiEslint,
  SiExpress,
  SiGiphy,
  SiGithubactions,
  SiHeadlessui,
  SiI18next,
  SiLucide,
  SiNextdotjs,
  SiNodedotjs,
  SiPayloadcms,
  SiPostgresql,
  SiPrettier,
  SiReact,
  SiReactrouter,
  SiRedis,
  SiSimpleicons,
  SiSocketdotio,
  SiTailwindcss,
  SiTanstack,
  SiTestinglibrary,
  SiTypescript,
  SiVite,
  SiVitest,
  SiZod,
} from "@icons-pack/react-simple-icons";
import {
  Activity,
  Database,
  Globe,
  HardDrive,
  LayoutDashboard,
  MessagesSquare,
  Server,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
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
const STACK: {
  id: string;
  items: {
    name: string;
    icon: ComponentType<SVGProps<SVGSVGElement> & { title?: string }> | string;
    color?: string;
  }[];
}[] = [
  {
    id: "web",
    items: [
      { name: "React", icon: SiReact, color: "#61DAFB" },
      { name: "React Router", icon: SiReactrouter, color: "#F87171" },
      { name: "TypeScript", icon: SiTypescript, color: "#60A5FA" },
      { name: "Vite", icon: SiVite, color: "#A78BFA" },
      { name: "Tailwind CSS", icon: SiTailwindcss, color: "#38BDF8" },
      { name: "Fontsource", icon: "/images/build-with/fontsource.png" },
      { name: "Headless UI", icon: SiHeadlessui, color: "#66E3FF" },
      { name: "Floating UI", icon: "/images/build-with/floating-ui.png" },
      { name: "TanStack Virtual", icon: SiTanstack, color: "#FBBF24" },
      { name: "Motion", icon: "/images/build-with/motion.png" },
      { name: "Lucide", icon: SiLucide, color: "#F56565" },
      { name: "Simple Icons", icon: SiSimpleicons, color: "currentColor" },
      { name: "Sonner", icon: "/images/build-with/sonner.png" },
      { name: "i18next", icon: SiI18next, color: "#26A69A" },
      { name: "TipTap", icon: "/images/build-with/tiptap.png" },
      { name: "DiceBear", icon: SiDicebear, color: "#93C5FD" },
      {
        name: "Emoji Picker React",
        icon: "/images/build-with/emoji-picker-react.png",
      },
      { name: "GIPHY", icon: SiGiphy, color: "#00FF99" },
      { name: "Cloudflare Turnstile", icon: SiCloudflare, color: "#F38020" },
    ],
  },
  {
    id: "server",
    items: [
      { name: "Node.js", icon: SiNodedotjs, color: "#5FA04E" },
      { name: "Express", icon: SiExpress, color: "currentColor" },
      { name: "Socket.IO", icon: SiSocketdotio, color: "currentColor" },
      { name: "Redis", icon: SiRedis, color: "#FF4438" },
      { name: "ioredis", icon: "/images/build-with/ioredis.svg" },
      { name: "zod", icon: SiZod, color: "#60A5FA" },
    ],
  },
  {
    id: "admin",
    items: [
      { name: "Payload CMS", icon: SiPayloadcms, color: "currentColor" },
      { name: "Next.js", icon: SiNextdotjs, color: "currentColor" },
      { name: "PostgreSQL", icon: SiPostgresql, color: "#7AAED1" },
    ],
  },
  {
    id: "hosting",
    items: [
      { name: "Docker Compose", icon: SiDocker, color: "#2496ED" },
      { name: "Caddy", icon: SiCaddy, color: "#4BC18A" },
      { name: "Oracle Cloud", icon: "/images/build-with/oracle-cloud.png" },
      { name: "Cloudflare Pages", icon: SiCloudflarepages, color: "#F38020" },
      { name: "Cloudflare R2", icon: SiCloudflare, color: "#F38020" },
      { name: "GitHub Actions", icon: SiGithubactions, color: "#60A5FA" },
      { name: "Dependabot", icon: SiDependabot, color: "#60A5FA" },
      { name: "UptimeRobot", icon: "/images/build-with/uptimerobot.png" },
    ],
  },
  {
    id: "development",
    items: [
      { name: "ESLint", icon: SiEslint, color: "#A78BFA" },
      { name: "Prettier", icon: SiPrettier, color: "#F7B93E" },
      { name: "audit-ci", icon: ShieldCheck, color: "#4ADE80" },
    ],
  },
  {
    id: "tests",
    items: [
      { name: "Vitest", icon: SiVitest, color: "#A3C96A" },
      { name: "Testing Library", icon: SiTestinglibrary, color: "#F87171" },
      { name: "jsdom", icon: "/images/build-with/jsdom.svg" },
      { name: "Playwright", icon: "/images/build-with/playwright.png" },
    ],
  },
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

        <Section title={t("about.stackTitle")}>
          <dl className="space-y-3">
            {STACK.map(({ id, items }) => (
              <div key={id} className="space-y-1">
                <dt className="text-sm text-neutral-400">
                  {t(`about.stack.${id}`)}
                </dt>
                <dd>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
                    {items.map(({ name, icon: Icon, color }) => (
                      <li
                        key={name}
                        className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-neutral-700 px-2 py-3 text-center text-sm"
                      >
                        {typeof Icon === "string" ? (
                          <img
                            src={Icon}
                            alt=""
                            aria-hidden="true"
                            width={32}
                            height={32}
                            className="size-8 shrink-0 object-contain"
                          />
                        ) : (
                          <Icon
                            aria-hidden="true"
                            focusable="false"
                            title=""
                            className="size-8 shrink-0"
                            color={color}
                          />
                        )}
                        <span className="flex min-h-10 items-center justify-center leading-5 wrap-anywhere">
                          {name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

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
