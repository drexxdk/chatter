import crypto from "crypto";

import { z } from "zod";

import { chatRoleSchema } from "./roles.js";

// A signed statement of who a moderator is, so the socket can trust it without asking Payload again. It carries
// no email and no password.
const claimsSchema = z.object({
  sub: z.number(),
  name: z.string().min(1),
  // Only roles that need signing in: nobody gets a token that says "guest".
  role: chatRoleSchema.exclude(["guest"]),
  exp: z.number(),
});

export type TokenClaims = z.infer<typeof claimsSchema>;

const sign = (body: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(body).digest("base64url");

export function signToken(
  claims: Omit<TokenClaims, "exp">,
  options: { secret: string; ttlMs: number; now?: number },
): string {
  const exp = (options.now ?? Date.now()) + options.ttlMs;
  const body = Buffer.from(JSON.stringify({ ...claims, exp })).toString(
    "base64url",
  );

  return `${body}.${sign(body, options.secret)}`;
}

export function verifyToken(
  token: unknown,
  options: { secret: string; now?: number },
): TokenClaims | undefined {
  if (typeof token !== "string") return undefined;

  const parts = token.split(".");
  if (parts.length !== 2) return undefined;

  const [body, signature] = parts;
  const expected = Buffer.from(sign(body, options.secret));
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return undefined;
  }

  try {
    const claims = claimsSchema.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );

    if (!claims.success) return undefined;
    return claims.data.exp > (options.now ?? Date.now())
      ? claims.data
      : undefined;
  } catch {
    return undefined;
  }
}
