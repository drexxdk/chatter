import crypto from "crypto";

import { AVATARS, PICTURE_STYLES, type Avatar } from "./avatars.js";

// Rooms only admins can enter, for trying out what the chat does in situations that are hard to get on purpose. They are
// not in Payload, never in the lobby, and not counted anywhere guests can see.
export const ADMIN_ROOMS = [
  {
    id: -1,
    name: "Test lab",
    slug: "admin-lab",
    maxMembers: null,
    slowModeSeconds: null,
    description: "An empty room with no limit, for trying things out.",
  },
  {
    id: -2,
    name: "Test room (4 people)",
    slug: "admin-small",
    maxMembers: 4,
    slowModeSeconds: null,
    description: "Room for four people, to see it fill up.",
  },
] as const;

export const isAdminRoom = (slug: string) =>
  ADMIN_ROOMS.some((room) => room.slug === slug);

export const adminRoomOf = (slug: string) =>
  ADMIN_ROOMS.find((room) => room.slug === slug);

export interface FakeMember {
  guestId: string;
  nickname: string;
  role: "guest";
  avatar: Avatar;
  picture: string;
  age?: number;
}

const NAMES = [
  "Alma",
  "Bjarke",
  "Clara",
  "Dennis",
  "Eva",
  "Frederik",
  "Greta",
  "Hugo",
  "Ida",
  "Jonas",
  "Karen",
  "Lars",
];

const pick = <T>(items: readonly T[]): T =>
  items[crypto.randomInt(items.length)] as T;

// Somebody who is not there: only a name in the room's list of people, which nobody can write to.
export function fakeMember(taken: string[]): FakeMember {
  const free = NAMES.filter((name) => !taken.includes(name));
  const nickname =
    free.length > 0 ? pick(free) : `Guest ${crypto.randomInt(1000)}`;

  return {
    guestId: `fake-${crypto.randomUUID()}`,
    nickname,
    role: "guest",
    avatar: pick(AVATARS),
    picture: `${pick(PICTURE_STYLES)}:${crypto.randomBytes(5).toString("hex")}`,
  };
}
