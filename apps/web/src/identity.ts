import type { Avatar } from "./chat/avatar";

export interface PublicPerson {
  guestId: string;
  nickname: string;
  avatar?: Avatar;
  age?: number;
}

const nameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

function identityToken(guestId: string): string {
  const bytes = new TextEncoder().encode(guestId);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return BigInt(`0x01${hex}`).toString(36).toUpperCase();
}

export function publicIdentityTag(guestId: string): string {
  const match =
    /^(m-|mod-)?([a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.exec(
      guestId,
    );
  if (!match?.[2]) return `X${identityToken(guestId)}`;
  const prefix = match[1] === "m-" ? "M" : match[1] === "mod-" ? "S" : "G";
  return `${prefix}${BigInt(`0x${match[2].replace(/-/g, "")}`)
    .toString(36)
    .toUpperCase()
    .padStart(25, "0")}`;
}

export function createIdentityDirectory(people: readonly PublicPerson[]) {
  const profiles = new Map<string, PublicPerson>();
  const owners = new Map<string, Set<string>>();
  const tokens = new Map<string, string>();
  const candidates = new Map<string, string[]>();
  for (const person of people) {
    if (!person.guestId) continue;
    if (!profiles.has(person.guestId)) profiles.set(person.guestId, person);
    const key = nameKey(person.nickname);
    const names = owners.get(key) ?? new Set<string>();
    names.add(person.guestId);
    owners.set(key, names);
    if (tokens.has(person.guestId)) continue;
    tokens.set(person.guestId, publicIdentityTag(person.guestId));
    const tag = publicIdentityTag(person.guestId).slice(-8);
    candidates.set(tag, [...(candidates.get(tag) ?? []), person.guestId]);
  }
  const tags = new Map<string, string>();
  for (const peers of candidates.values()) {
    for (const guestId of peers) {
      const token = tokens.get(guestId)!;
      let length = 8;
      while (
        peers.some(
          (peer) =>
            peer !== guestId &&
            tokens.get(peer)!.slice(-length) === token.slice(-length),
        )
      )
        length++;
      tags.set(guestId, token.slice(-length).padStart(8, "0"));
    }
  }
  return {
    person: (guestId: string) => profiles.get(guestId),
    tag: publicIdentityTag,
    shortTag: (guestId: string) =>
      tags.get(guestId) ?? publicIdentityTag(guestId).slice(-8),
    label(person: PublicPerson, always = false): string {
      if (
        !person.guestId ||
        (!always && (owners.get(nameKey(person.nickname))?.size ?? 0) < 2)
      )
        return person.nickname;
      return `${person.nickname} \u00b7 ${always ? publicIdentityTag(person.guestId) : (tags.get(person.guestId) ?? publicIdentityTag(person.guestId).slice(-8))}`;
    },
  };
}

export type IdentityDirectory = ReturnType<typeof createIdentityDirectory>;
