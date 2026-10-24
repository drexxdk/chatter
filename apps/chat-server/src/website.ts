import type { WebsiteContent } from "../../../shared/websiteContent.mjs";
import { env } from "./env.js";
import { log } from "./log.js";
import { fetchWebsiteContent } from "./payloadClient.js";
import { redis } from "./redis.js";

const CACHE_KEY = "chatter:website";

export async function getCachedWebsite(): Promise<WebsiteContent | undefined> {
  const cached = await redis.get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as WebsiteContent) : undefined;
}

export function startWebsiteSync(): NodeJS.Timeout {
  let syncing = false;
  const sync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      await redis.set(CACHE_KEY, JSON.stringify(await fetchWebsiteContent()));
    } catch (error) {
      log.error("Failed to sync roadmap and releases", error);
    } finally {
      syncing = false;
    }
  };
  void sync();
  return setInterval(() => void sync(), env.SYNC_INTERVAL_MS);
}
