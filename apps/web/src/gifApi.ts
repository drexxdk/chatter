import { sendableGifUrl } from "./chat/gifs";

export interface Gif {
  id: string;
  title: string;
  // Small, for the picker; and the one that gets sent.
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

export interface GifPage {
  gifs: Gif[];
  // Where the next page starts, or null at the end.
  next: number | null;
}

const API = "https://api.giphy.com/v1/gifs";
const PAGE_SIZE = 24;
// What GIPHY serves at most.
const MAX_OFFSET = { search: 4999, trending: 499 };

// GIPHY asks for its public key to be used from the browser, and for searches to come from there too. Without a key
// the chat has no GIF button.
export const gifApiKey = (): string | undefined =>
  (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim() ||
  undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function rendition(images: unknown, name: string) {
  const entry = isRecord(images) ? images[name] : undefined;
  if (!isRecord(entry)) return undefined;

  const { url, width, height } = entry;
  const w = Number(width);
  const h = Number(height);

  return typeof url === "string" && w > 0 && h > 0
    ? { url, width: w, height: h }
    : undefined;
}

function parseGif(value: unknown): Gif | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;

  const small = rendition(value.images, "fixed_width");
  const sent = rendition(value.images, "fixed_height");
  const url = sent && sendableGifUrl(sent.url);

  if (!small || !sent || !url) return undefined;

  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    previewUrl: small.url,
    url,
    width: small.width,
    height: small.height,
  };
}

export async function fetchGifs(
  query: string,
  offset: number,
  language: string | undefined,
  signal?: AbortSignal,
): Promise<GifPage> {
  const key = gifApiKey();
  if (!key) throw new Error("GIFs are not set up");

  const params = new URLSearchParams({
    api_key: key,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    // Suitable for everybody: a chat has no way to warn anyone.
    rating: "g",
    ...(query ? { q: query } : {}),
    ...(language ? { lang: language } : {}),
  });
  const kind = query ? "search" : "trending";
  const response = await fetch(`${API}/${kind}?${params}`, { signal });

  if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);

  const body: unknown = await response.json();
  const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  const pagination = isRecord(body) ? body.pagination : undefined;
  const total =
    isRecord(pagination) && Number.isFinite(Number(pagination.total_count))
      ? Number(pagination.total_count)
      : 0;
  const reached = offset + data.length;

  return {
    gifs: data.flatMap((item) => parseGif(item) ?? []),
    next:
      data.length > 0 && reached < total && reached <= MAX_OFFSET[kind]
        ? reached
        : null,
  };
}
