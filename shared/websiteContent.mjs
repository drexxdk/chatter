export const ROADMAP_STATUSES = ["planned", "exploring", "in-progress", "done"];
export const ROADMAP_PRIORITIES = ["high", "medium", "low"];
export const ROADMAP_CATEGORIES = [
  "reliability",
  "chat",
  "experience",
  "documentation",
  "engineering",
];

export function websiteText(texts, language = "en") {
  return (
    texts[language]?.trim() ||
    texts[language.split("-")[0]]?.trim() ||
    texts.en?.trim() ||
    Object.values(texts).find((text) => text?.trim()) ||
    ""
  );
}
