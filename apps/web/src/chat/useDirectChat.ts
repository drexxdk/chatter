import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { PLAIN_AVATAR } from "./avatar";
import { playNotificationSound } from "../notificationSound";
import { isRecord } from "../isRecord";
import {
  addDirectMessage,
  applyDirectReaction,
  applyPresence,
  dropBlockedByNotices,
  isStatus,
  markRead,
  markReturned,
  parseDirectMessage,
  parseDirectReaction,
  parsePartner,
  redactDirect,
  refreshPartners,
  setBlockedBy,
  type DirectEntry,
  type DirectThread,
  type Partner,
} from "./direct";
import { parsePicture } from "./picture";
import {
  toResult,
  type Ack,
  type ActionResult,
  type ConnectOptions,
  type Member,
} from "./types";

export function useDirectChat({
  emitWithAck,
  settle,
  membersRef,
  ownGuestIdsRef,
}: {
  emitWithAck: (event: string, payload?: unknown) => Promise<Ack>;
  settle: (ack: Ack) => void;
  membersRef: RefObject<Member[]>;
  ownGuestIdsRef: RefObject<string[]>;
}) {
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const threadsRef = useRef<DirectThread[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const partnerRef = useRef<Partner | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const blockedRef = useRef<string[]>([]);
  const restoredPartnerRef = useRef<string | null>(null);
  const selfGuestIdRef = useRef<string | null>(null);
  const receivedIdsRef = useRef(new Set<string>());
  const [sessionVersion, setSessionVersion] = useState(0);
  const [partnerPresence, setPartnerPresence] = useState<
    Record<string, boolean>
  >({});
  const watchedIdsKey = JSON.stringify(
    [
      ...new Set([
        ...(partner ? [partner.guestId] : []),
        ...threads.map((thread) => thread.guestId),
      ]),
    ]
      .slice(0, 50)
      .sort(),
  );

  useEffect(() => {
    if (sessionVersion === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    async function watch() {
      const ack = await emitWithAck("dm:watch", {
        guestIds: JSON.parse(watchedIdsKey),
      });
      if (cancelled || ack.ok || retries >= 3) return;
      if (ack.error === "rate_limited" || ack.error === "unavailable") {
        retries += 1;
        timer = setTimeout(
          () => void watch(),
          ack.retryAfterMs ?? 1000 * retries,
        );
      }
    }
    void watch();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [emitWithAck, sessionVersion, watchedIdsKey]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const getBlockedGuestIds = useCallback(
    (): readonly string[] => blockedRef.current,
    [],
  );

  const restoreDirect = useCallback(
    (
      options: Pick<ConnectOptions, "threads" | "blockedIds" | "openGuestId">,
    ) => {
      setThreads(options.threads ?? []);
      blockedRef.current = options.blockedIds ?? [];
      setBlockedIds(blockedRef.current);
      const open = options.threads?.find(
        (thread) => thread.guestId === options.openGuestId,
      );
      partnerRef.current = open
        ? {
            guestId: open.guestId,
            nickname: open.nickname,
            role: open.role,
            avatar: open.avatar,
            ...(open.picture ? { picture: open.picture } : {}),
          }
        : null;
      restoredPartnerRef.current = open ? open.guestId : null;
      setPartner(partnerRef.current);
    },
    [],
  );

  const resetDirect = useCallback(() => {
    receivedIdsRef.current.clear();
    setPartnerPresence({});
    setThreads([]);
    blockedRef.current = [];
    setBlockedIds([]);
  }, []);

  const resetDirectRoom = useCallback(() => {
    partnerRef.current = null;
    restoredPartnerRef.current = null;
    setPartner(null);
  }, []);

  const rejectDirectRestore = useCallback(() => {
    if (restoredPartnerRef.current) {
      restoredPartnerRef.current = null;
      partnerRef.current = null;
      setPartner(null);
    }
  }, []);

  const restoreDirectSession = useCallback(
    (guestId: string, resumed: boolean) => {
      selfGuestIdRef.current = guestId;
      setSessionVersion((version) => version + 1);
      if (resumed) {
        setThreads((previous) =>
          markReturned(previous, new Date().toISOString(), () =>
            crypto.randomUUID(),
          ),
        );
      }
    },
    [],
  );

  const applyDirectPresence = useCallback((members: Member[]) => {
    setThreads((previous) => refreshPartners(previous, members));

    const open = partnerRef.current;
    const now = open
      ? members.find((member) => member.guestId === open.guestId)
      : undefined;
    if (
      open &&
      now &&
      (now.nickname !== open.nickname ||
        (now.avatar ?? PLAIN_AVATAR) !== open.avatar ||
        parsePicture(now.picture) !== open.picture ||
        now.age !== open.age)
    ) {
      partnerRef.current = {
        ...open,
        nickname: now.nickname,
        avatar: now.avatar ?? PLAIN_AVATAR,
        picture: parsePicture(now.picture),
        age: now.age,
      };
      setPartner(partnerRef.current);
    }
  }, []);

  const receiveDirectPresence = useCallback((value: unknown) => {
    if (
      !isRecord(value) ||
      !Array.isArray(value.guestIds) ||
      !Array.isArray(value.members)
    )
      return;
    const guestIds = value.guestIds.filter(
      (id): id is string => typeof id === "string",
    );
    const members = value.members
      .map(parsePartner)
      .filter((member): member is Partner => !!member);
    const online = new Set(members.map((member) => member.guestId));
    setPartnerPresence((previous) => ({
      ...previous,
      ...Object.fromEntries(guestIds.map((id) => [id, online.has(id)])),
    }));
    const restored = restoredPartnerRef.current;
    if (restored && guestIds.includes(restored)) {
      restoredPartnerRef.current = null;
      if (!online.has(restored)) {
        partnerRef.current = null;
        setPartner(null);
      }
    }
    setThreads((previous) => {
      const presentIds = new Set(
        previous
          .filter(
            (thread) => !guestIds.includes(thread.guestId) && thread.present,
          )
          .map((thread) => thread.guestId),
      );
      for (const id of online) presentIds.add(id);
      return refreshPartners(
        applyPresence(
          previous,
          presentIds,
          new Date().toISOString(),
          false,
          () => crypto.randomUUID(),
          blockedRef.current,
        ),
        members,
      );
    });
    const open = partnerRef.current;
    const current = members.find((member) => member.guestId === open?.guestId);
    if (open && current) {
      partnerRef.current = current;
      setPartner(current);
    }
  }, []);

  const receiveDirect = useCallback(
    (value: unknown) => {
      const message = parseDirectMessage(value);
      if (!message) return;
      const mine = message.fromGuestId === selfGuestIdRef.current;
      const received = receivedIdsRef.current;
      const duplicate =
        received.has(message.id) ||
        threadsRef.current.some((thread) =>
          thread.entries.some(
            (entry) => !isStatus(entry) && entry.id === message.id,
          ),
        );
      received.add(message.id);
      if (received.size > 200) {
        const oldest = received.values().next().value;
        if (oldest !== undefined) received.delete(oldest);
      }
      if (
        !mine &&
        !duplicate &&
        !threadsRef.current.some(
          (thread) => thread.guestId === message.fromGuestId && thread.muted,
        ) &&
        !blockedRef.current.includes(message.fromGuestId)
      ) {
        void playNotificationSound();
      }
      const known = membersRef.current.find(
        (member) =>
          member.guestId === (mine ? message.toGuestId : message.fromGuestId),
      );
      const knownThread = threadsRef.current.find(
        (thread) =>
          thread.guestId === (mine ? message.toGuestId : message.fromGuestId),
      );
      const other: Partner = mine
        ? {
            guestId: message.toGuestId,
            nickname: message.toNickname,
            role: known?.role ?? "guest",
            avatar: message.toAvatar,
            age: known?.age ?? knownThread?.age,
            ...(message.toPicture ? { picture: message.toPicture } : {}),
          }
        : {
            guestId: message.fromGuestId,
            nickname: message.fromNickname,
            role: message.fromRole,
            avatar: message.fromAvatar,
            age: known?.age ?? knownThread?.age,
            ...(message.fromPicture ? { picture: message.fromPicture } : {}),
          };
      const viewing = partnerRef.current?.guestId === other.guestId;
      setPartnerPresence((previous) => ({
        ...previous,
        [other.guestId]: true,
      }));
      setThreads((previous) => {
        const next = addDirectMessage(
          previous,
          other,
          message,
          !mine && !viewing,
        );
        return mine ? markRead(next, other.guestId) : next;
      });
    },
    [membersRef],
  );

  const receiveDirectReaction = useCallback((value: unknown) => {
    const update = parseDirectReaction(value);
    if (!update) return;
    setThreads((previous) =>
      applyDirectReaction(previous, update, selfGuestIdRef.current),
    );
  }, []);

  const receiveDirectBlock = useCallback((value: unknown, blocked: boolean) => {
    const blocker = parsePartner(value);
    if (!blocker) return;
    setThreads((previous) =>
      setBlockedBy(
        previous,
        blocker,
        blocked,
        new Date().toISOString(),
        () => crypto.randomUUID(),
        blockedRef.current.includes(blocker.guestId),
      ),
    );
  }, []);

  const redactDirectMessages = useCallback((notice: unknown) => {
    setThreads((previous) => redactDirect(previous, notice));
  }, []);

  const reactDirect = useCallback(
    async (
      partnerGuestId: string,
      messageId: string,
      emoji: string,
    ): Promise<void> => {
      const message = threadsRef.current
        .find((thread) => thread.guestId === partnerGuestId)
        ?.entries.find(
          (entry: DirectEntry) => !isStatus(entry) && entry.id === messageId,
        );
      const had =
        !!message &&
        !isStatus(message) &&
        !!message.reactions
          ?.find((reaction) => reaction.emoji === emoji)
          ?.users.some((user) => ownGuestIdsRef.current.includes(user.guestId));

      settle(
        await emitWithAck("dm:react", {
          toGuestId: partnerGuestId,
          messageId,
          emoji,
          on: !had,
        }),
      );
    },
    [emitWithAck, ownGuestIdsRef, settle],
  );

  const openDirect = useCallback((next: Partner) => {
    partnerRef.current = next;
    setPartner(next);
    setThreads((previous) => markRead(previous, next.guestId));
  }, []);

  const markDirectRead = useCallback((guestId: string) => {
    setThreads((previous) => markRead(previous, guestId));
  }, []);

  const setMuted = useCallback((guestId: string, muted: boolean) => {
    setThreads((previous) =>
      previous.map((thread) =>
        thread.guestId === guestId
          ? {
              ...thread,
              muted: muted || undefined,
              unread: muted ? 0 : thread.unread,
            }
          : thread,
      ),
    );
  }, []);

  const closeDirect = useCallback(() => {
    partnerRef.current = null;
    setPartner(null);
  }, []);

  const sendDirect = useCallback(
    async (toGuestId: string, text: string): Promise<ActionResult> => {
      const result = toResult(
        await emitWithAck("dm:send", { toGuestId, text }),
      );

      // The server says so when the other person has blocked the guest, whether or not it was told earlier.
      if (!result.ok && result.error === "blocked_by_recipient") {
        const member = membersRef.current.find(
          (candidate) => candidate.guestId === toGuestId,
        );

        setThreads((previous) => {
          const thread = previous.find(
            (candidate) => candidate.guestId === toGuestId,
          );
          const partner: Partner | undefined = thread
            ? {
                guestId: toGuestId,
                nickname: thread.nickname,
                role: thread.role,
                avatar: thread.avatar,
                ...(thread.picture ? { picture: thread.picture } : {}),
              }
            : member
              ? {
                  guestId: toGuestId,
                  nickname: member.nickname,
                  role: member.role ?? "guest",
                  avatar: member.avatar ?? PLAIN_AVATAR,
                  ...(member.picture ? { picture: member.picture } : {}),
                }
              : undefined;

          return partner
            ? setBlockedBy(
                previous,
                partner,
                true,
                new Date().toISOString(),
                () => crypto.randomUUID(),
              )
            : previous;
        });
      }

      return result;
    },
    [emitWithAck, membersRef],
  );

  const setBlocked = useCallback(
    async (guestId: string, blocked: boolean): Promise<ActionResult> => {
      const result = toResult(
        await emitWithAck(blocked ? "dm:block" : "dm:unblock", { guestId }),
      );

      if (result.ok) {
        blockedRef.current = blocked
          ? [...blockedRef.current.filter((id) => id !== guestId), guestId]
          : blockedRef.current.filter((id) => id !== guestId);
        setBlockedIds(blockedRef.current);
        // What they wrote before is not going to be answered from here.
        if (blocked) {
          setThreads((previous) =>
            dropBlockedByNotices(markRead(previous, guestId), guestId),
          );
        }
      }

      return result;
    },
    [emitWithAck],
  );

  const activeThread = partner
    ? threads.find((thread) => thread.guestId === partner.guestId)
    : undefined;
  const direct = {
    threads,
    active: partner
      ? { ...partner, entries: activeThread?.entries ?? [] }
      : null,
    blockedIds,
    isPresent: (guestId: string) =>
      partnerPresence[guestId] ??
      threads.find((thread) => thread.guestId === guestId)?.present ??
      membersRef.current.some((member) => member.guestId === guestId),
    blockedByIds: threads
      .filter(
        (thread) => thread.blockedBy && !blockedIds.includes(thread.guestId),
      )
      .map((thread) => thread.guestId),
    open: openDirect,
    close: closeDirect,
    markRead: markDirectRead,
    setMuted,
    send: sendDirect,
    react: reactDirect,
    setBlocked,
  };

  return {
    direct,
    getBlockedGuestIds,
    restoreDirect,
    resetDirect,
    resetDirectRoom,
    rejectDirectRestore,
    restoreDirectSession,
    applyDirectPresence,
    receiveDirect,
    receiveDirectPresence,
    receiveDirectReaction,
    receiveDirectBlock,
    redactDirectMessages,
  };
}
