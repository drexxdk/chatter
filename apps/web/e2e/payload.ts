import crypto from "node:crypto";
import fs from "node:fs";
import { parseEnv } from "node:util";

import { E2E } from "./constants";

// The browser reaches the chat-server over loopback, which it may report in any of these forms.
const LOOPBACK_ADDRESSES = ["::1", "127.0.0.1", "::ffff:127.0.0.1"];

function adminCredentials() {
  const file = new URL("../../admin/.env", import.meta.url);
  const env = parseEnv(fs.readFileSync(file, "utf8"));

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "apps/admin/.env needs SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD",
    );
  }

  return { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD };
}

// Same hashing as apps/chat-server/src/identity.ts, using the e2e server's salt.
function hashIdentifier(ip: string) {
  return crypto
    .createHash("sha256")
    .update(`${E2E.banHashSalt}:${ip}`)
    .digest("hex");
}

// A wedged admin dev server accepts connections but never answers; fail with a message instead of hanging.
const REQUEST_TIMEOUT_MS = 30_000;

export class PayloadApi {
  private token = "";

  async login() {
    const response = await fetch(`${E2E.payloadUrl}/api/admins/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminCredentials()),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok)
      throw new Error(`Payload login failed: ${response.status}`);
    this.token = ((await response.json()) as { token: string }).token;
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${E2E.payloadUrl}/api/${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `JWT ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Payload ${init.method ?? "GET"} ${path} failed: ${response.status}`,
      );
    }

    return (await response.json()) as {
      doc?: { id: number };
      docs?: { id: number }[];
    };
  }

  // Payload fills in a slow mode of 10 seconds unless it is sent explicitly, which would slow every test down.
  async createRoom(
    name: string,
    slug: string,
    maxMembers: number,
    slowModeSeconds: number | null = null,
  ) {
    const { doc } = await this.request("public-rooms", {
      method: "POST",
      body: JSON.stringify({ name, slug, maxMembers, slowModeSeconds }),
    });
    return doc!.id;
  }

  async banLoopback() {
    return this.ban(LOOPBACK_ADDRESSES);
  }

  async ban(addresses: readonly string[]) {
    const ids: number[] = [];

    for (const ip of addresses) {
      const { doc } = await this.request("bans", {
        method: "POST",
        body: JSON.stringify({
          identifierHash: hashIdentifier(ip),
          reason: E2E.banReason,
        }),
      });
      ids.push(doc!.id);
    }

    return ids;
  }

  async remove(collection: "public-rooms" | "bans", id: number) {
    await this.request(`${collection}/${id}`, { method: "DELETE" });
  }

  // Removes anything an earlier, interrupted run left behind.
  async sweepLeftovers() {
    const rooms = await this.request(
      `public-rooms?limit=100&where[slug][like]=${E2E.slugPrefix}`,
    );
    const bans = await this.request(
      `bans?limit=100&where[reason][equals]=${E2E.banReason}`,
    );

    await Promise.all([
      ...(rooms.docs ?? []).map((room) => this.remove("public-rooms", room.id)),
      ...(bans.docs ?? []).map((ban) => this.remove("bans", ban.id)),
    ]);
  }
}
