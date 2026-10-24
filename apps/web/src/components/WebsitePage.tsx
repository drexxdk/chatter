import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  CircleDot,
  LoaderCircle,
  RefreshCw,
  Search,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import {
  ROADMAP_CATEGORIES,
  ROADMAP_PRIORITIES,
  ROADMAP_STATUSES,
  websiteText,
  type RoadmapStatus,
  type WebsiteContent,
} from "../../../../shared/websiteContent.mjs";
import { fetchWebsiteContent } from "../api";
import { ROADMAP_PATH, VERSIONS_PATH } from "../place";
import { Breadcrumb } from "./Breadcrumb";
import { Button } from "./Button";
import { LegalLinks, LINK } from "./LegalLinks";
import { MENU_ITEM, MENU_SURFACE } from "./dropdown";

const STATUS_ICON: Record<RoadmapStatus, LucideIcon> = {
  planned: Circle,
  exploring: CircleDashed,
  "in-progress": CircleDot,
  done: CheckCircle2,
};
const STATUS_COLOR: Record<RoadmapStatus, string> = {
  planned: "text-neutral-300",
  exploring: "text-sky-300",
  "in-progress": "text-amber-300",
  done: "text-emerald-300",
};

function Filter({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton
        aria-label={label}
        className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        <span className="truncate">
          {values.find((option) => option.value === value)?.label ??
            values[0]?.label ??
            label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-400"
        />
      </ListboxButton>
      <ListboxOptions
        anchor={{ to: "bottom start", gap: 4, padding: 8 }}
        modal={false}
        className={`${MENU_SURFACE} z-40 max-h-72 min-w-44 w-(--button-width)`}
      >
        {values.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className={`${MENU_ITEM} group gap-3 px-3 py-2`}
          >
            <span className="flex-1">{option.label}</span>
            <Check
              aria-hidden="true"
              className="invisible size-4 group-data-selected:visible"
            />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}

export function WebsitePage({ page }: { page: "roadmap" | "versions" }) {
  const { t, i18n } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const title = t(`development.${page}`);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetchWebsiteContent(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setContent(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!content || !hash) return;
    let identifier: string;
    try {
      identifier = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[id]") ?? [],
      ).find((element) => element.id === identifier);
      target?.scrollIntoView?.({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [content, hash]);
  const text = (value: Record<string, string>) =>
    websiteText(value, i18n.resolvedLanguage);
  const choose = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const query = (params.get("q") ?? "")
    .trim()
    .toLocaleLowerCase(i18n.resolvedLanguage);
  const options = (values: readonly string[], group: string) => [
    { value: "all", label: t(`development.all.${group}`) },
    ...values.map((value) => ({
      value,
      label: t(`development.${group}.${value}`),
    })),
  ];
  const selection = (key: string, values: readonly string[]) =>
    values.includes(params.get(key) ?? "") ? params.get(key)! : "all";
  const status = selection("status", ROADMAP_STATUSES);
  const priority = selection("priority", ROADMAP_PRIORITIES);
  const category = selection("category", ROADMAP_CATEGORIES);
  const roadmap = (content?.roadmap ?? [])
    .filter(
      (item) =>
        (status === "all" || item.status === status) &&
        (priority === "all" || item.priority === priority) &&
        (category === "all" || item.category === category) &&
        (!query ||
          `${text(item.title)} ${text(item.description)}`
            .toLocaleLowerCase(i18n.resolvedLanguage)
            .includes(query)),
    )
    .sort(
      (first, second) =>
        Number(first.status === "done") - Number(second.status === "done") ||
        ROADMAP_PRIORITIES.indexOf(first.priority) -
          ROADMAP_PRIORITIES.indexOf(second.priority) ||
        first.order - second.order,
    );

  return (
    <div ref={root} className="flex flex-1 flex-col gap-6">
      <Breadcrumb title={title} />
      <header className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          {content && page === "roadmap" && (
            <p className="text-sm text-neutral-400">
              {t("development.completed", {
                count: content.roadmap.filter((item) => item.status === "done")
                  .length,
                total: content.roadmap.length,
              })}
            </p>
          )}
        </div>
        <nav
          aria-label={t("development.navigation")}
          className="flex gap-6 border-b border-neutral-800"
        >
          {(
            [
              ["roadmap", ROADMAP_PATH],
              ["versions", VERSIONS_PATH],
            ] as const
          ).map(([name, path]) => (
            <NavLink
              key={name}
              to={path}
              className={({ isActive }) =>
                `border-b-2 px-1 pb-3 text-sm font-medium ${isActive ? "border-emerald-400 text-neutral-100" : "border-transparent text-neutral-400 hover:text-neutral-100"}`
              }
            >
              {t(`development.${name}`)}
            </NavLink>
          ))}
        </nav>
      </header>
      {failed ? (
        <div role="alert" className="space-y-3 py-6">
          <p>{t("development.error")}</p>
          <Button
            icon={RefreshCw}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("development.retry")}
          </Button>
        </div>
      ) : !content ? (
        <div
          role="status"
          className="flex items-center gap-2 py-8 text-neutral-400"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-4 motion-safe:animate-spin"
          />
          {t("development.loading")}
        </div>
      ) : page === "roadmap" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-3">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3 size-4 text-neutral-400"
              />
              <input
                type="search"
                aria-label={t("development.search")}
                placeholder={t("development.search")}
                value={params.get("q") ?? ""}
                onChange={(event) => choose("q", event.target.value)}
                className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-900 pr-3 pl-9 text-sm"
              />
            </div>
            <Filter
              label={t("development.filterStatus")}
              value={status}
              values={options(ROADMAP_STATUSES, "status")}
              onChange={(value) => choose("status", value)}
            />
            <Filter
              label={t("development.filterPriority")}
              value={priority}
              values={options(ROADMAP_PRIORITIES, "priority")}
              onChange={(value) => choose("priority", value)}
            />
            <Filter
              label={t("development.filterCategory")}
              value={category}
              values={options(ROADMAP_CATEGORIES, "category")}
              onChange={(value) => choose("category", value)}
            />
          </div>
          <p role="status" className="text-sm text-neutral-400">
            {t("development.results", { count: roadmap.length })}
          </p>
          <ol className="divide-y divide-neutral-800">
            {roadmap.map((item) => {
              const Icon = STATUS_ICON[item.status];
              return (
                <li
                  key={item.key}
                  id={item.key}
                  className="scroll-mt-24 py-5 first:pt-0"
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 size-5 shrink-0 ${STATUS_COLOR[item.status]}`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <h2 className="text-base font-semibold wrap-break-word">
                        {text(item.title)}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className={STATUS_COLOR[item.status]}>
                          {t(`development.status.${item.status}`)}
                        </span>
                        <span
                          className={
                            item.priority === "high" && item.status !== "done"
                              ? "text-amber-300"
                              : "text-neutral-400"
                          }
                        >
                          {t(`development.priority.${item.priority}`)}
                        </span>
                        <span className="text-neutral-400">
                          {t(`development.category.${item.category}`)}
                        </span>
                        {item.release && (
                          <Link
                            to={`${VERSIONS_PATH}#release-${item.release}`}
                            className={LINK}
                          >
                            v{item.release}
                          </Link>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-neutral-300 wrap-break-word">
                        {text(item.description)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {!roadmap.length && (
            <p className="py-6 text-neutral-400">
              {t(
                content.roadmap.length
                  ? "development.noMatches"
                  : "development.emptyRoadmap",
              )}
            </p>
          )}
        </>
      ) : (
        <div className="divide-y divide-neutral-800">
          {!content.releases.length && (
            <p className="py-6 text-neutral-400">
              {t("development.emptyReleases")}
            </p>
          )}
          {content.releases.map((release, index) => (
            <article
              key={release.version}
              id={`release-${release.version}`}
              className="scroll-mt-24 space-y-4 py-6 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Tag aria-hidden="true" className="size-5 text-emerald-300" />
                <h2 className="text-xl font-semibold">v{release.version}</h2>
                {index === 0 && (
                  <span className="text-xs font-medium text-emerald-300">
                    {t("development.latest")}
                  </span>
                )}
                <time
                  dateTime={release.releasedAt}
                  className="text-sm text-neutral-400"
                >
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(release.releasedAt))}
                </time>
              </div>
              <h3 className="text-base font-semibold wrap-break-word">
                {text(release.title)}
              </h3>
              <p className="text-sm whitespace-pre-line text-neutral-300 wrap-break-word">
                {text(release.summary)}
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-300">
                {text(release.changes)
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, lineIndex) => (
                    <li key={lineIndex} className="wrap-break-word">
                      {line}
                    </li>
                  ))}
              </ul>
              {content.roadmap.some(
                (item) => item.release === release.version,
              ) && (
                <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {content.roadmap
                    .filter((item) => item.release === release.version)
                    .map((item) => (
                      <li key={item.key}>
                        <Link
                          className={LINK}
                          to={`${ROADMAP_PATH}#${item.key}`}
                        >
                          {text(item.title)}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
      <footer className="mt-auto border-t border-neutral-800 pt-5">
        <LegalLinks />
      </footer>
    </div>
  );
}
