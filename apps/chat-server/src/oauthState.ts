import crypto from "crypto";

import { z } from "zod";

import { redis } from "./redis.js";

// What is kept while the person is at the provider: which provider, the PKCE secret, and where to send them back to. It
// lives ten minutes and works once, so a copied return address cannot be played again.
const TTL_SECONDS = 600;

const stateSchema = z.object({
  provider: z.string(),
  verifier: z.string(),
  returnPath: z.string(),
  staffAccountId: z.number().int().positive().optional(),
  memberAccountId: z.number().int().positive().optional(),
});

export type OAuthState = z.infer<typeof stateSchema>;

const key = (state: string) => `chatter:oauth:state:${state}`;

export async function saveState(data: OAuthState): Promise<string> {
  const state = crypto.randomBytes(24).toString("base64url");

  await redis.set(key(state), JSON.stringify(data), "EX", TTL_SECONDS);

  return state;
}

// Taken, not read: asking again gets nothing.
export async function takeState(
  state: unknown,
): Promise<OAuthState | undefined> {
  if (typeof state !== "string" || state.length === 0 || state.length > 100) {
    return undefined;
  }

  const stored = await redis.getdel(key(state));
  if (!stored) return undefined;

  const parsed = stateSchema.safeParse(JSON.parse(stored));
  return parsed.success ? parsed.data : undefined;
}
