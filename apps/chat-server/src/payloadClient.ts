import { z } from "zod";

import { parseAge } from "./age.js";
import { parseAvatar, type Avatar } from "./avatars.js";
import { env } from "./env.js";

// Payload's API-key auth header format is "<collection-slug> API-Key <key>".
const AUTH_HEADER = `admins API-Key ${env.PAYLOAD_SERVICE_API_KEY}`;

// Only the listed fields are kept, so a field added to the collection later never reaches a public endpoint.
const publicRoomSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  // Empty in Payload means the room has no limit.
  maxMembers: z.number().int().min(1).nullish(),
  // Seconds a guest must wait between messages; a room that leaves it empty gets the server's default.
  slowModeSeconds: z
    .number()
    .int()
    .min(1)
    .nullish()
    .transform((seconds) => seconds ?? env.DEFAULT_SLOW_MODE_SECONDS),
  description: z.string().nullish(),
});

// An unreadable expiry used to count as already expired, which would silently lift the ban.
const banSchema = z.object({
  id: z.number(),
  identifierHash: z.string().min(1),
  reason: z.string().nullish(),
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
});

export type PublicRoom = z.infer<typeof publicRoomSchema>;
export type Ban = z.infer<typeof banSchema>;

const describeIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

// The status says what went wrong (a 404 is "not there", a 400 can be "already taken"). `detail` is the start of what
// Payload answered, only for such checks: it can carry what was sent, so it is never logged.
export class PayloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail = "",
  ) {
    super(message);
  }
}

// A response that fails validation is rejected whole, so the caller keeps serving its last good copy.
// The message names the field only: ban hashes and reasons must not end up in logs.
async function payloadFetch<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.output<T>> {
  const res = await fetch(`${env.PAYLOAD_URL}${path}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!res.ok) {
    throw new PayloadError(
      `Payload request failed: ${res.status} ${res.statusText} (${path})`,
      res.status,
    );
  }

  const result = schema.safeParse(await res.json());

  if (!result.success) {
    throw new Error(
      `Unexpected response from Payload (${path}): ${describeIssues(result.error)}`,
    );
  }

  return result.data;
}

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const data = await payloadFetch(
    "/api/public-rooms?limit=100",
    z.object({ docs: z.array(publicRoomSchema) }),
  );
  return data.docs;
}

export async function fetchBans(): Promise<Ban[]> {
  const data = await payloadFetch(
    "/api/bans?limit=1000",
    z.object({ docs: z.array(banSchema) }),
  );
  return data.docs;
}

export interface Account {
  id: number;
  role: string;
  displayName: string | null;
}

// Payload checks the credentials itself (and locks an account after repeated failures). The service key is left
// out on purpose: the person's own password is what vouches for them. Undefined means "not accepted", whatever the
// reason, so a wrong email, a wrong password and a locked account look the same.
export async function loginAccount(
  email: string,
  password: string,
): Promise<Account | undefined> {
  const res = await fetch(`${env.PAYLOAD_URL}/api/admins/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401 || res.status === 403) return undefined;

  if (!res.ok) {
    throw new Error(`Payload login failed: ${res.status} ${res.statusText}`);
  }

  const result = z
    .object({
      user: z.object({
        id: z.number(),
        role: z.string(),
        displayName: z.string().nullish(),
      }),
    })
    .safeParse(await res.json());

  if (!result.success) {
    throw new Error(
      `Unexpected response from Payload (login): ${describeIssues(result.error)}`,
    );
  }

  const { id, role, displayName } = result.data.user;
  return { id, role, displayName: displayName ?? null };
}

export interface Moderator {
  id: number;
  // Moderators without a display name cannot sign in to the chat, but their names are not theirs to take either.
  name: string | null;
}

// The accounts that can moderate: their names so guests cannot pick one, and their ids so a removed account stops
// working before its token expires.
export async function fetchModerators(): Promise<Moderator[]> {
  const data = await payloadFetch(
    "/api/admins?where[role][in]=moderator,super-admin&limit=100&depth=0",
    z.object({
      docs: z.array(
        z.object({ id: z.number(), displayName: z.string().nullish() }),
      ),
    }),
  );

  return data.docs.map((doc) => ({
    id: doc.id,
    name: doc.displayName || null,
  }));
}

// One field of the terms in every language, as Payload returns it with `locale=all`: `{ en: ..., da: ..., de: ... }`. A
// language that has not been written has nothing (or null) under its code.
const perLanguage = <T extends z.ZodType>(value: T) =>
  z.record(z.string(), value.nullish());

// Before anybody has written it, Payload gives an array field as an empty list instead of the per-language object.
const sectionsPerLanguage = z.preprocess(
  (value) => (Array.isArray(value) ? {} : value),
  perLanguage(
    z.array(
      z.object({
        heading: z.string(),
        paragraphs: z.string().nullish(),
        items: z.string().nullish(),
      }),
    ),
  ),
);

const legalDocumentSchema = z
  .object({
    title: perLanguage(z.string()),
    updated: perLanguage(z.string()),
    sections: sectionsPerLanguage,
  })
  .partial()
  .nullish();

// Everything optional: the global exists in Payload before anybody has written it.
const legalGlobalSchema = z.object({
  termsVersion: z.string().nullish(),
  contactEmail: z.string().nullish(),
  terms: legalDocumentSchema,
  privacy: legalDocumentSchema,
});

export type LegalGlobal = z.infer<typeof legalGlobalSchema>;

// The published terms of use and privacy policy, in all languages.
export async function fetchLegal(): Promise<LegalGlobal> {
  return payloadFetch(
    "/api/globals/legal?locale=all&depth=0",
    legalGlobalSchema,
  );
}

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "sexual",
  "illegal",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

// What the admin keeps of a reported message, so it can be judged after the room's history has expired.
export interface ReportRecord {
  messageId: string;
  roomSlug: string;
  text: string;
  nickname: string;
  guestId: string;
  // The sender's salted address hash: a super-admin can copy it into Bans. Empty for a moderator's message.
  senderHash: string;
  reporterCount: number;
  hidden: boolean;
  reason: ReportReason;
}

const reportDocSchema = z.object({
  id: z.number(),
  reasons: z.array(z.string()).nullish(),
  status: z.string().nullish(),
});

async function payloadSend(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${env.PAYLOAD_URL}${path}`, {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!res.ok) {
    throw new PayloadError(
      `Payload request failed: ${res.status} ${res.statusText} (${method} ${path.split("?")[0]})`,
      res.status,
      (await res.text().catch(() => "")).slice(0, 500),
    );
  }

  return res.json();
}

// One report document per message: the first report makes it, later ones raise the count and add the reason. The
// text and the sender are kept as they were when the message was first reported.
export async function saveReport(record: ReportRecord): Promise<void> {
  const find = async () => {
    const data = await payloadFetch(
      `/api/reports?where[messageId][equals]=${encodeURIComponent(record.messageId)}&limit=1&depth=0`,
      z.object({ docs: z.array(reportDocSchema) }),
    );
    return data.docs[0];
  };

  const update = (doc: z.infer<typeof reportDocSchema>) =>
    payloadSend("PATCH", `/api/reports/${doc.id}`, {
      reporterCount: record.reporterCount,
      reasons: [...new Set([...(doc.reasons ?? []), record.reason])],
      // A report already dealt with keeps its status.
      ...(record.hidden && (doc.status ?? "open") === "open"
        ? { status: "hidden" }
        : {}),
    });

  const existing = await find();

  if (existing) {
    await update(existing);
    return;
  }

  try {
    await payloadSend("POST", "/api/reports", {
      messageId: record.messageId,
      roomSlug: record.roomSlug,
      text: record.text,
      nickname: record.nickname,
      guestId: record.guestId,
      senderHash: record.senderHash,
      reporterCount: record.reporterCount,
      reasons: [record.reason],
      status: record.hidden ? "hidden" : "open",
    });
  } catch (error) {
    // Two first reports at once: the other one made the document, so this one joins it.
    const created = await find();
    if (!created) throw error;
    await update(created);
  }
}

// Removes the reports made before the cutoff, with the messages they kept.
export async function deleteReportsBefore(cutoff: Date): Promise<void> {
  await payloadSend(
    "DELETE",
    `/api/reports?where[createdAt][less_than]=${encodeURIComponent(cutoff.toISOString())}`,
  );
}

// A person with an account (the `users` collection). Only the chat-server writes them.
const userSchema = z.object({
  id: z.number(),
  provider: z.string(),
  providerUserId: z.string(),
  email: z.string().nullish(),
  nickname: z.string().min(1),
  nicknameKey: z.string().min(1),
  avatar: z.string().nullish().transform(parseAvatar),
  age: z
    .number()
    .nullish()
    .transform((age) => parseAge(age)),
});

export type UserRecord = z.infer<typeof userSchema>;

export interface NewUser {
  provider: string;
  providerUserId: string;
  email?: string;
  emailVerified?: boolean;
  nickname: string;
  nicknameKey: string;
  avatar: Avatar;
  age?: number;
}

export interface UserChanges {
  nickname?: string;
  nicknameKey?: string;
  avatar?: Avatar;
  // null takes the age back.
  age?: number | null;
  lastLoginAt?: string;
}

const userDocSchema = z.object({ doc: userSchema });

// Whether Payload refused a write because another document already has this value in the field.
export const isTaken = (error: unknown, field: string): boolean =>
  error instanceof PayloadError &&
  error.status === 400 &&
  error.detail.includes(field);

export async function findUserByIdentity(
  identity: string,
): Promise<UserRecord | undefined> {
  const data = await payloadFetch(
    `/api/users?where[identity][equals]=${encodeURIComponent(identity)}&limit=1&depth=0`,
    z.object({ docs: z.array(userSchema) }),
  );

  return data.docs[0];
}

// Undefined when there is no such account (it was deleted); other failures are thrown.
export async function fetchUser(id: number): Promise<UserRecord | undefined> {
  try {
    return await payloadFetch(`/api/users/${id}?depth=0`, userSchema);
  } catch (error) {
    if (error instanceof PayloadError && error.status === 404) return undefined;
    throw error;
  }
}

function parseDoc(body: unknown, what: string): UserRecord {
  const result = userDocSchema.safeParse(body);

  if (!result.success) {
    throw new Error(
      `Unexpected response from Payload (${what}): ${describeIssues(result.error)}`,
    );
  }

  return result.data.doc;
}

export async function createUser(user: NewUser): Promise<UserRecord> {
  return parseDoc(
    await payloadSend("POST", "/api/users", {
      provider: user.provider,
      providerUserId: user.providerUserId,
      identity: `${user.provider}:${user.providerUserId}`,
      email: user.email,
      emailVerified: user.emailVerified ?? false,
      nickname: user.nickname,
      nicknameKey: user.nicknameKey,
      avatar: user.avatar,
      age: user.age,
      lastLoginAt: new Date().toISOString(),
    }),
    "create user",
  );
}

export async function updateUser(
  id: number,
  changes: UserChanges,
): Promise<UserRecord> {
  return parseDoc(
    await payloadSend("PATCH", `/api/users/${id}`, changes),
    "update user",
  );
}

export async function deleteUser(id: number): Promise<void> {
  await payloadSend("DELETE", `/api/users/${id}`);
}

// Every account's id and normalized nickname, for the list of names a guest may not take.
export async function fetchUserNames(): Promise<
  { id: number; nicknameKey: string }[]
> {
  const names: { id: number; nicknameKey: string }[] = [];

  for (let page = 1; ; page++) {
    const data = await payloadFetch(
      `/api/users?limit=1000&page=${page}&depth=0&select[nicknameKey]=true`,
      z.object({
        docs: z.array(z.object({ id: z.number(), nicknameKey: z.string() })),
        hasNextPage: z.boolean(),
      }),
    );

    names.push(...data.docs);
    if (!data.hasNextPage) return names;
  }
}
