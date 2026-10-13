import crypto from "crypto";

import { z } from "zod";

// What a provider vouched for, handed to the browser while it picks a nickname: the account is only made once there is
// one. Signed, so the browser cannot name a different person, and short-lived. It is not a session: the chat does not
// accept it, and a session token does not pass as one (the signature covers a different text).
const ticketSchema = z.object({
  provider: z.string().min(1),
  providerUserId: z.string().min(1),
  email: z.string().optional(),
  emailVerified: z.boolean().optional(),
  // What the provider calls them, to suggest as a nickname.
  name: z.string().optional(),
  exp: z.number(),
});

export type TicketClaims = z.infer<typeof ticketSchema>;

const sign = (body: string, secret: string) =>
  crypto
    .createHmac("sha256", secret)
    .update(`ticket:${body}`)
    .digest("base64url");

export function signTicket(
  claims: Omit<TicketClaims, "exp">,
  options: { secret: string; ttlMs: number; now?: number },
): string {
  const body = Buffer.from(
    JSON.stringify({
      ...claims,
      exp: (options.now ?? Date.now()) + options.ttlMs,
    }),
  ).toString("base64url");

  return `${body}.${sign(body, options.secret)}`;
}

export function verifyTicket(
  ticket: unknown,
  options: { secret: string; now?: number },
): TicketClaims | undefined {
  if (typeof ticket !== "string") return undefined;

  const [body, signature, extra] = ticket.split(".");
  if (!body || !signature || extra !== undefined) return undefined;

  const expected = Buffer.from(sign(body, options.secret));
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return undefined;
  }

  try {
    const claims = ticketSchema.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );

    return claims.success && claims.data.exp > (options.now ?? Date.now())
      ? claims.data
      : undefined;
  } catch {
    return undefined;
  }
}
