export const ROADMAP_STATUSES: readonly [
  "planned",
  "exploring",
  "in-progress",
  "done",
];
export const ROADMAP_PRIORITIES: readonly ["high", "medium", "low"];
export const ROADMAP_CATEGORIES: readonly [
  "reliability",
  "chat",
  "experience",
  "documentation",
  "engineering",
];
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type RoadmapPriority = (typeof ROADMAP_PRIORITIES)[number];
export type RoadmapCategory = (typeof ROADMAP_CATEGORIES)[number];
export type WebsiteText = Record<string, string>;
export interface RoadmapItem {
  key: string;
  title: WebsiteText;
  description: WebsiteText;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  category: RoadmapCategory;
  order: number;
  release?: string;
}
export interface WebsiteRelease {
  version: string;
  title: WebsiteText;
  summary: WebsiteText;
  changes: WebsiteText;
  releasedAt: string;
}
export interface WebsiteContent {
  roadmap: RoadmapItem[];
  releases: WebsiteRelease[];
}
export function websiteText(texts: WebsiteText, language?: string): string;
