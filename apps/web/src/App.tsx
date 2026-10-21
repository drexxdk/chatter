import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";

import {
  AccountError,
  deleteAccount,
  fetchAccount,
  SignInError,
  signInModerator,
  signInPassword,
  updateAccountProfile,
  type Room,
  type AccountSession,
  type PasswordClaim,
} from "./api";
import {
  accountOf,
  clearAccount,
  loadAccount,
  saveAccount,
  type Account,
} from "./account";
import { PLAIN_AVATAR, type Avatar } from "./chat/avatar";
import type { CreateSocket } from "./chat/socket";
import type { ActionResult } from "./chat/types";
import { useChat } from "./chat/useChat";
import { AboutPage } from "./components/AboutPage";
import { createTabCoordinator, type TabCoordinator } from "./activeTab";
import { AdminMenu } from "./components/AdminMenu";
import { CreateAccountDialog } from "./components/AccountSection";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import { Button } from "./components/Button";
import { ErrorAlert } from "./components/ErrorAlert";
import { LegalLinks } from "./components/LegalLinks";
import { legalDocOf, LegalPage } from "./components/LegalPage";
import { Lobby, useRooms } from "./components/Lobby";
import { MainMenu } from "./components/MainMenu";
import { NicknameDialog } from "./components/NicknameDialog";
import { NotificationSoundDialog } from "./components/NotificationSoundDialog";
import { ModeratorDialog } from "./components/ModeratorDialog";
import { PageFrame } from "./components/PageFrame";
import { ProfileDialog, type ProfileSubject } from "./components/ProfileDialog";
import { RoomSwitcher } from "./components/RoomSwitcher";
import { QueueDialog } from "./components/QueueDialog";
import { RoomSearch } from "./components/RoomSearch";
import { TabNotice } from "./components/TabNotice";
import { ViewTransition } from "./components/ViewTransition";
import { LOBBY_PATH, pageFromPath, roomPath, slugFromPath } from "./place";
import { useLegal } from "./legal/useLegal";
import {
  loadNotificationSound,
  loadShowMovements,
  saveNotificationSound,
  saveShowMovements,
  type NotificationSoundPreferences,
} from "./preferences";
import { prepareNotificationSound } from "./notificationSound";
import type { ProfileChanges } from "./profile";
import {
  clearSession,
  loadDirect,
  loadSession,
  onSignedOutElsewhere,
  rememberConnection,
  rememberProfile,
  saveDirect,
  saveModerator,
  saveSession,
  type SavedSession,
} from "./session";
import { useKept } from "./useKept";
import { dropHeldScroll } from "./scrollHold";
import { usePageTitle } from "./usePageTitle";

const ChatRoom = lazy(() =>
  import("./components/ChatRoom").then((module) => ({
    default: module.ChatRoom,
  })),
);

// The server's answer when somebody else in the room already has the guest's nickname.
const NAME_TAKEN = "nickname_taken";

export function App({
  createSocket,
  reconnectDelaysMs,
  tabs: tabsOverride,
}: {
  createSocket?: CreateSocket;
  reconnectDelaysMs?: number[];
  // How the tabs of the browser agree that one of them is in a room; the browser's own channel unless told otherwise.
  tabs?: TabCoordinator;
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const chat = useChat(createSocket, { reconnectDelaysMs });
  const {
    state: roomsState,
    retry,
    refresh: refreshRooms,
  } = useRooms(!chat.roomSlug);
  const { state: legalState, retry: retryLegal } = useLegal();
  // The version of the terms the guest has to have accepted; null while the chat-server has not said.
  const termsVersion =
    legalState.status === "ready" ? legalState.legal.version : null;
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  // Whether it is known who this tab is: not while the saved guest is being brought back, so that the header does not
  // show no profile for a moment to somebody who has one. A page that starts in a room shows nothing of the lobby until then.
  const [settled, setSettled] = useState(
    () => slugFromPath(location.pathname) === null && !loadSession(),
  );
  const startedInRoom = useRef(slugFromPath(location.pathname) !== null);
  // The room last tried, and whether the numbers have shown it full since it turned out to be.
  const attemptedRoom = useRef<string | null>(null);
  const sawFull = useRef(false);
  // The room the dialog asks for a nickname for stays for it to fade out.
  const shownRoom = useKept(pendingRoom);
  const [tabs] = useState(() => tabsOverride ?? createTabCoordinator());
  // The room that was to be entered, or was left, because another tab is in one; the notice about it stays to fade out.
  const [elsewhere, setElsewhere] = useState<string | null>(null);
  const shownElsewhere = useKept(elsewhere);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [moderatorOpen, setModeratorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  // Who is signed in with a provider, kept in this browser; null for a guest.
  const [account, setAccount] = useState<Account | null>(loadAccount);
  const [showMovements, setShowMovements] = useState(loadShowMovements);
  const [notificationSound, setNotificationSound] = useState(
    loadNotificationSound,
  );
  const [notificationSoundOpen, setNotificationSoundOpen] = useState(false);

  function changeNotificationSound(value: NotificationSoundPreferences) {
    setNotificationSound(value);
    saveNotificationSound(value);
    if (value.enabled) void prepareNotificationSound();
  }

  useEffect(() => {
    if (!notificationSound.enabled) return;
    const unlock = () => {
      void prepareNotificationSound();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [notificationSound.enabled]);

  function changeShowMovements(show: boolean) {
    setShowMovements(show);
    saveShowMovements(show);
  }

  const rooms = roomsState.status === "ready" ? roomsState.rooms : [];
  // The rooms only an admin can enter are listed for them alone, in the lobby and the room switcher.
  const adminRooms = (chat.session?.adminRooms ?? []).map((room) => ({
    ...room,
    memberCount: chat.adminCounts[room.slug] ?? 0,
  }));
  const knownRooms = [...rooms, ...adminRooms];
  // What the admin's tools work on: the test room they are in, and otherwise the first.
  const testRoom =
    adminRooms.find((room) => room.slug === chat.roomSlug) ??
    adminRooms[0] ??
    null;
  const currentRoom = knownRooms.find((room) => room.slug === chat.roomSlug);
  const inRoom = Boolean(chat.roomSlug && chat.session);
  // What is shown when not in a room: one of the site's pages, or the lobby.
  const page = pageFromPath(location.pathname);
  // The tab says the room while in one, the page on one of those, and the site alone in the lobby; private messages
  // not yet seen are counted in front.
  usePageTitle(
    inRoom
      ? (currentRoom?.name ?? chat.roomSlug ?? undefined)
      : page === "about"
        ? t("about.title")
        : page
          ? (legalDocOf(legalState, i18n.resolvedLanguage, page)?.title ??
            t(`legal.${page}`))
          : undefined,
    chat.direct.threads.reduce((sum, thread) => sum + thread.unread, 0),
  );

  const resumeDetails = () => {
    const resume = chat.resume();
    return resume ? { resume } : {};
  };

  // Whether another tab of the browser is in a room, which this tab may not enter then; the notice says so and offers
  // to take over. The address goes back to the lobby when it named the room.
  async function otherTabHasRoom(slug: string): Promise<boolean> {
    if (!(await tabs.otherInRoom())) return false;

    setElsewhere(slug);
    if (slugFromPath(location.pathname))
      navigate(LOBBY_PATH, { replace: true });

    return true;
  }

  async function handleSelect(room: Room) {
    if (await otherTabHasRoom(room.slug)) return;

    await enterRoom(room);
  }

  // This tab becomes the one that is in a room; the other is told to leave its own.
  async function takeOverRoom() {
    const slug = elsewhere;

    setElsewhere(null);
    tabs.claim();

    const room = knownRooms.find((candidate) => candidate.slug === slug);
    if (room) await enterRoom(room);
  }

  async function enterRoom(room: Room) {
    chat.clearError();
    attemptedRoom.current = room.slug;

    if (chat.status === "connected") {
      const joined = await chat.joinRoom(room.slug);

      // Somebody in that room has the guest's name: they are asked for another.
      if (!joined.ok && joined.error === NAME_TAKEN) setPendingRoom(room);
    } else if (account) {
      await joinAsMember(room, account);
    } else {
      setPendingRoom(room);
    }
  }

  // Somebody signed in has no name to ask for: the account says who they are.
  async function joinAsMember(room: Room, member: Account) {
    if (!(await chat.connect(member.nickname, { token: member.token }))) {
      if (await forgetAccountIfExpired(member.token)) setPendingRoom(room);
      return;
    }

    saveSession({
      nickname: member.nickname,
      token: member.token,
      guestIds: chat.guestIds(),
      ...resumeDetails(),
    });
    await chat.joinRoom(room.slug);
  }

  // A token the server does not accept is no use any more: the account is forgotten, and the person is a guest again.
  async function forgetAccountIfExpired(token: string): Promise<boolean> {
    try {
      await fetchAccount(token);
    } catch (cause) {
      if (cause instanceof AccountError && cause.code === "invalid_token") {
        clearAccount();
        setAccount(null);
        return true;
      }
    }

    return false;
  }

  // Brings back the connection of the guest (or account) this tab already was, from what was saved when they joined.
  // What was saved no longer works when it fails, so it is not tried again.
  async function reconnect(saved: SavedSession): Promise<boolean> {
    const direct = loadDirect();
    const connected = await chat.connect(saved.nickname, {
      token: saved.token,
      avatar: saved.avatar,
      picture: saved.picture,
      age: saved.age,
      previousGuestIds: saved.guestIds,
      resume: saved.resume,
      threads: direct.threads,
      blockedIds: direct.blockedIds,
      openGuestId: direct.openGuestId,
    });

    if (!connected) {
      clearSession();
      if (saved.token) await forgetAccountIfExpired(saved.token);
      return false;
    }

    saveSession({ ...saved, guestIds: chat.guestIds(), ...resumeDetails() });
    return true;
  }

  function signOut() {
    dropHeldScroll();
    clearAccount();
    setAccount(null);
    clearSession();
    setProfileOpen(false);
    setAccountOpen(false);
    setCreateAccountOpen(false);
    chat.disconnect();
  }

  async function deleteMyAccount() {
    if (!account) return;

    try {
      await deleteAccount(account.token);
    } catch (cause) {
      throw cause instanceof AccountError
        ? cause
        : new AccountError("connection");
    }

    signOut();
    // The server cut the connection off when the account went; that is not an error to show.
    chat.clearError();
  }

  function closeProfile() {
    setProfileOpen(false);
    setAccountOpen(false);
  }

  function openAccountCreation() {
    closeProfile();
    setCreateAccountOpen(true);
  }

  // Who the profile dialog shows: whoever is connected, in a room or not, and otherwise the account's.
  const profile: ProfileSubject | null = chat.session
    ? chat.session
    : account
      ? {
          role: "member",
          nickname: account.nickname,
          avatar: account.avatar,
          picture: account.picture,
          age: account.age,
        }
      : null;

  // While connected the chat connection makes the change (and the copy of the account here follows it, below); with
  // none, the account itself is changed on the server.
  async function saveProfile(changes: ProfileChanges): Promise<ActionResult> {
    if (chat.session) return chat.updateProfile(changes);
    if (!account) return { ok: false, error: "forbidden" };

    try {
      const saved = await updateAccountProfile(account.token, changes);
      const { age: _age, picture: _picture, ...rest } = account;
      const next: Account = {
        ...rest,
        nickname: saved.nickname,
        ...(saved.picture ? { picture: saved.picture } : {}),
        avatar: saved.avatar,
        ...(saved.age === undefined ? {} : { age: saved.age }),
      };

      saveAccount(next);
      setAccount(next);
      return { ok: true };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof AccountError ? cause.code : "connection",
      };
    }
  }

  async function handleNickname(
    nickname: string,
    avatar: Avatar,
    picture: string,
  ) {
    if (!pendingRoom) return;

    if (await otherTabHasRoom(pendingRoom.slug)) {
      setPendingRoom(null);
      return;
    }

    // The plain avatar is what the server gives anyone who sends none, so it is not sent or kept.
    const chosen = avatar === PLAIN_AVATAR ? undefined : avatar;

    if (!(await chat.connect(nickname, { avatar: chosen, picture }))) return;

    saveSession({
      nickname,
      ...(chosen ? { avatar: chosen } : {}),
      picture,
      guestIds: chat.guestIds(),
      ...resumeDetails(),
    });
    const room = pendingRoom;

    // The name may be somebody else's in that room: then the dialog stays, with the reason, for another one.
    dropHeldScroll();
    const joined = await chat.joinRoom(room.slug);
    if (joined.ok || joined.error !== NAME_TAKEN) setPendingRoom(null);
  }

  async function acceptMember(session: AccountSession) {
    const member = accountOf(session);
    saveAccount(member);
    setAccount(member);
    const slug = chat.roomSlug;
    const direct = loadDirect();
    if (
      !(await chat.connect(member.nickname, {
        token: member.token,
        previousGuestIds: chat.guestIds(),
        threads: direct.threads,
        blockedIds: direct.blockedIds,
        openGuestId: direct.openGuestId,
      }))
    )
      throw new AccountError("connection");
    saveSession({
      nickname: member.nickname,
      token: member.token,
      guestIds: chat.guestIds(),
      ...resumeDetails(),
    });
    if (slug) await chat.joinRoom(slug);
  }

  async function claimAccount(input: PasswordClaim) {
    await acceptMember(await chat.claimAccount(input));
    setCreateAccountOpen(false);
    setProfileOpen(true);
  }

  async function handleSignIn(email: string, password: string) {
    setSignInError(null);
    chat.clearError();
    setSigningIn(true);

    try {
      if (!email.includes("@")) {
        await acceptMember(await signInPassword(email, password));
        setModeratorOpen(false);
        return;
      }
      const slug = chat.roomSlug;
      const moderator = await signInModerator(email, password);

      if (!(await chat.connect(moderator.name, { token: moderator.token })))
        return;

      saveSession({
        nickname: moderator.name,
        token: moderator.token,
        guestIds: chat.guestIds(),
        ...resumeDetails(),
      });
      saveModerator({ nickname: moderator.name, token: moderator.token });
      if (slug) await chat.joinRoom(slug);
      setModeratorOpen(false);
    } catch (cause) {
      setSignInError(
        cause instanceof SignInError || cause instanceof AccountError
          ? cause.code
          : "connection",
      );
    } finally {
      setSigningIn(false);
    }
  }

  function clearDialogErrors() {
    setSignInError(null);
    chat.clearError();
  }

  function handleCancel() {
    setPendingRoom(null);
    clearDialogErrors();
    // Still in a room (the guest was only trying another one): its address stays.
    if (!chat.roomSlug && slugFromPath(location.pathname)) {
      navigate(LOBBY_PATH, { replace: true });
    }
  }

  // What the effects that run on a change of the room or of the address have to read as it is now.
  const latest = useRef({
    chat,
    rooms: knownRooms,
    handleSelect,
    location,
    navigate,
    signedIn: false,
    signOut,
  });
  latest.current = {
    chat,
    rooms: knownRooms,
    handleSelect,
    location,
    navigate,
    signedIn: Boolean(account) || chat.session?.role === "moderator",
    signOut,
  };

  // Signing out in one tab signs this one out too, but a guest has nothing shared to lose.
  useEffect(
    () =>
      onSignedOutElsewhere(() => {
        if (latest.current.signedIn) latest.current.signOut();
      }),
    [],
  );

  // The message that a room is full goes once the numbers show it was full and now has room.
  useEffect(() => {
    if (chat.error !== "room_full") {
      sawFull.current = false;
      return;
    }

    const room = latest.current.rooms.find(
      (candidate) => candidate.slug === attemptedRoom.current,
    );

    if (!room || typeof room.memberCount !== "number") return;

    if (
      typeof room.maxMembers === "number" &&
      room.memberCount >= room.maxMembers
    ) {
      sawFull.current = true;
    } else if (sawFull.current) {
      latest.current.chat.clearError();
    }
  }, [chat.error, roomsState, chat.adminCounts]);

  // The other tabs are told when this one is in a room, and this one leaves its room when another takes over.
  useEffect(() => {
    tabs.setInRoom(inRoom);
  }, [tabs, inRoom]);
  useEffect(
    () =>
      tabs.onDisplaced(() => {
        const { chat: current, navigate: go } = latest.current;

        if (!current.roomSlug) return;

        setElsewhere(current.roomSlug);
        void current.leaveRoom();
        go(LOBBY_PATH, { replace: true });
      }),
    [tabs],
  );

  // The address says where the guest is, so a reload (or a shared link) can put them back. Entering a room adds a
  // history entry and leaving adds another, which is what makes the browser's back button leave the room.
  const previousRoom = useRef<string | null>(null);
  useEffect(() => {
    const slug = chat.roomSlug;
    const { location, navigate } = latest.current;

    if (slug) {
      if (location.pathname !== roomPath(slug)) navigate(roomPath(slug));
    } else if (previousRoom.current && location.pathname !== LOBBY_PATH) {
      navigate(LOBBY_PATH);
    }

    previousRoom.current = slug;
  }, [chat.roomSlug]);

  // The tab's guest is remembered while they are connected, and forgotten as soon as the connection ends for good.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (chat.status === "idle") {
      if (wasConnected.current) clearSession();
      wasConnected.current = false;
    } else {
      wasConnected.current = true;
    }
  }, [chat.status]);

  // Every connection has its own guest id and its own secret for resuming; the latest ones are what the next page
  // load has to present, and the ids used so far are what keeps earlier messages shown as the guest's.
  useEffect(() => {
    rememberConnection({
      guestIds: chat.ownGuestIds,
      resume: chat.resume(),
    });
    // `chat.resume()` reads what the connection was last given, which has changed whenever the session has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.ownGuestIds, chat.session]);

  // A change to the profile is what a reload has to bring the guest back as.
  useEffect(() => {
    if (chat.session && chat.session.role !== "moderator") {
      rememberProfile({
        nickname: chat.session.nickname,
        avatar: chat.session.avatar,
        picture: chat.session.picture,
        age: chat.session.age,
      });
    }
  }, [chat.session]);

  // The account is checked when the page opens: the token comes back renewed, and an account that is gone (or a token
  // that ran out) is forgotten. Not reaching the server leaves everything as it was.
  useEffect(() => {
    const current = loadAccount();
    if (!current) return;

    let cancelled = false;

    fetchAccount(current.token)
      .then((session) => {
        if (cancelled) return;

        const renewed = accountOf(session);

        saveAccount(renewed);
        setAccount(renewed);
      })
      .catch((cause: unknown) => {
        if (
          !cancelled &&
          cause instanceof AccountError &&
          cause.code === "invalid_token"
        ) {
          clearAccount();
          setAccount(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // What a signed-in person changes about themselves is kept in the account on the server; the copy in this browser
  // follows, so the header and the next visit show the same.
  useEffect(() => {
    const session = chat.session;
    if (session?.role !== "member") return;

    setAccount((current) => {
      if (
        !current ||
        (current.nickname === session.nickname &&
          current.avatar === session.avatar &&
          current.picture === session.picture &&
          current.age === session.age)
      ) {
        return current;
      }

      const { age: _age, picture: _picture, ...rest } = current;
      const next: Account = {
        ...rest,
        nickname: session.nickname,
        ...(session.picture ? { picture: session.picture } : {}),
        ...(session.avatar ? { avatar: session.avatar } : {}),
        ...(session.age === undefined ? {} : { age: session.age }),
      };

      saveAccount(next);
      return next;
    });
  }, [chat.session]);

  // Private conversations live only in the page, so what is open is kept for a reload. Not before there is a
  // connection: a reloaded page starts empty and must not overwrite what it is about to restore.
  useEffect(() => {
    if (chat.status === "idle") return;

    saveDirect({
      threads: chat.direct.threads,
      blockedIds: chat.direct.blockedIds,
      openGuestId: chat.direct.active?.guestId,
    });
  }, [
    chat.status,
    chat.direct.threads,
    chat.direct.blockedIds,
    chat.direct.active?.guestId,
  ]);

  // Arriving at a room's address (a reload, a link): wait for the rooms, then join as the guest this tab already was,
  // or ask who they are. Arriving at the lobby, the guest this tab already was is connected again, as they were when
  // they left a room, so that they are not somebody else for having reloaded there.
  const restored = useRef(false);
  // No dependency list on purpose: it runs after every render until the rooms have arrived, then once for good.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (restored.current) return;

    const slug = slugFromPath(location.pathname);

    if (!slug) {
      // Not before the rooms have been asked for: a connection made in the first moments of the page is closed again by
      // React's remount in development, and the connection hook then waits for it for good.
      if (roomsState.status === "loading") return;

      restored.current = true;
      const saved = loadSession();
      if (saved) void reconnect(saved).finally(() => setSettled(true));
      else setSettled(true);
      return;
    }

    if (roomsState.status === "error") {
      // The room cannot be looked for; the lobby says so.
      setSettled(true);
      return;
    }

    if (roomsState.status !== "ready") return;
    restored.current = true;

    const room = roomsState.rooms.find((candidate) => candidate.slug === slug);

    if (!room) {
      // Not in the list: perhaps one only an admin can enter, which the server tells of once they are connected. Whoever
      // this tab already was is brought back either way, and the server says whether the room is theirs.
      const saved = loadSession();

      if (!saved) {
        navigate(LOBBY_PATH, { replace: true });
        setSettled(true);
        return;
      }

      void (async () => {
        if (!(await reconnect(saved))) {
          navigate(LOBBY_PATH, { replace: true });
        } else if (
          !(await otherTabHasRoom(slug)) &&
          !(await chat.joinRoom(slug)).ok
        ) {
          navigate(LOBBY_PATH, { replace: true });
        }

        setSettled(true);
      })();
      return;
    }

    const saved = loadSession();

    if (!saved) {
      // Back from signing in with a provider, to the room that was being joined: the account says who they are.
      const member = loadAccount();

      if (member) {
        void (async () => {
          if (!(await otherTabHasRoom(room.slug)))
            await joinAsMember(room, member);
          setSettled(true);
        })();
        return;
      }

      setPendingRoom(room);
      setSettled(true);
      return;
    }

    void (async () => {
      if (!(await reconnect(saved))) {
        setPendingRoom(room);
        setSettled(true);
        return;
      }

      if (await otherTabHasRoom(room.slug)) {
        setSettled(true);
        return;
      }

      const joined = await chat.joinRoom(room.slug);

      if (!joined.ok) {
        // Somebody in the room has the guest's name: they are asked for another instead of being sent away.
        if (joined.error === NAME_TAKEN) setPendingRoom(room);
        else navigate(LOBBY_PATH, { replace: true });
      }

      setSettled(true);
    })();
  });

  // The back and forward buttons: the address changed under us, so the room follows it.
  const seenLocation = useRef(location.key);
  useEffect(() => {
    if (seenLocation.current === location.key) return;
    seenLocation.current = location.key;
    if (navigationType !== "POP") return;

    const { chat, rooms, handleSelect, location: here } = latest.current;
    const slug = slugFromPath(here.pathname);

    if (!slug) {
      setPendingRoom(null);
      if (chat.roomSlug) void chat.leaveRoom();
      return;
    }

    const room = rooms.find((candidate) => candidate.slug === slug);
    if (room && slug !== chat.roomSlug) void handleSelect(room);
  }, [location.key, navigationType]);

  const adminTools = chat.session?.admin ? (
    <AdminMenu
      room={testRoom}
      queueTest={chat.session.queueTest ?? { enabled: false, ahead: 0 }}
      crowd={chat.crowd?.roomSlug === testRoom?.slug ? chat.crowd : null}
      onTool={(event, payload) => void chat.adminTool(event, payload)}
      onAdvance={
        chat.queue &&
        chat.session.queueTest?.enabled &&
        chat.session.adminRooms?.some(
          (room) => room.slug === chat.queue?.roomSlug,
        )
          ? () =>
              chat.adminTool("admin:queue:advance", {
                slug: chat.queue?.roomSlug,
              })
          : undefined
      }
    />
  ) : undefined;

  return (
    <>
      <PageFrame
        roomSlug={chat.roomSlug && chat.session ? chat.roomSlug : undefined}
        flush={inRoom}
        wide={inRoom}
        header={
          <>
            {chat.roomSlug && chat.session ? (
              <div className="flex min-w-0 max-w-[calc(100%-8rem)] items-center gap-1 sm:max-w-[35%]">
                <h1 className="sr-only">{t("app.title")}</h1>
                <RoomSwitcher
                  // The room you are in is counted from who is in it now, which is newer than the list.
                  rooms={knownRooms.map((room) =>
                    room.slug === chat.roomSlug
                      ? {
                          ...room,
                          memberCount: chat.members.filter(
                            (member) => member.role !== "moderator",
                          ).length,
                        }
                      : room,
                  )}
                  slug={chat.roomSlug}
                  name={currentRoom?.name ?? chat.roomSlug}
                  disabled={chat.status !== "connected"}
                  onSelect={(room) => void handleSelect(room)}
                  onLeave={() => void chat.leaveRoom()}
                  onOpen={refreshRooms}
                />
              </div>
            ) : page ? (
              <Link to={LOBBY_PATH} className="text-2xl font-bold">
                {t("app.title")}
              </Link>
            ) : (
              <h1
                className={
                  settled || !startedInRoom.current
                    ? "text-2xl font-bold"
                    : "sr-only"
                }
              >
                {t("app.title")}
              </h1>
            )}
            {chat.roomSlug && chat.session && !chat.direct.active && (
              <RoomSearch
                key={chat.roomSlug}
                roomSlug={chat.roomSlug}
                roomName={currentRoom?.name ?? chat.roomSlug}
                messages={chat.messages}
                threads={chat.direct.threads}
                ownGuestIds={chat.ownGuestIds}
              />
            )}
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {settled && !account && !chat.session && (
                <Button
                  icon={LogIn}
                  onClick={() => {
                    clearDialogErrors();
                    setModeratorOpen(true);
                  }}
                >
                  {t("nickname.signIn")}
                </Button>
              )}
              {!chat.queue && adminTools}
              <MainMenu
                notifications={{
                  enabled: notificationSound.enabled,
                  onOpen: () => setNotificationSoundOpen(true),
                }}
                profile={
                  !settled
                    ? undefined
                    : chat.session
                      ? {
                          nickname: chat.session.nickname,
                          detail:
                            chat.session.role === "member"
                              ? account?.username
                              : chat.session.role === "guest"
                                ? t("account.guest")
                                : undefined,
                          avatar: chat.session.avatar,
                          picture: chat.session.picture,
                          moderator: chat.session.role === "moderator",
                          guest: chat.session.role === "guest",
                          onCreateAccount: openAccountCreation,
                          onSignIn: () => {
                            clearDialogErrors();
                            setModeratorOpen(true);
                          },
                          onProfile: () => setProfileOpen(true),
                          onSignOut: signOut,
                        }
                      : account
                        ? {
                            nickname: account.nickname,
                            detail: account.username,
                            avatar: account.avatar,
                            picture: account.picture,
                            onProfile: () => setAccountOpen(true),
                            onSignOut: signOut,
                          }
                        : undefined
                }
                movements={
                  chat.roomSlug && chat.session && !chat.direct.active
                    ? { checked: showMovements, onChange: changeShowMovements }
                    : undefined
                }
              />
            </div>
          </>
        }
      >
        {chat.announcement && (
          <AnnouncementBanner
            announcement={chat.announcement}
            onDismiss={chat.dismissAnnouncement}
          />
        )}
        <ViewTransition
          viewKey={inRoom ? `room:${chat.roomSlug}` : (page ?? "lobby")}
          depth={inRoom || page ? 1 : 0}
          hold={!settled && startedInRoom.current}
        >
          {chat.roomSlug && chat.session ? (
            <Suspense
              fallback={
                <div
                  aria-busy="true"
                  className="grid flex-1 place-items-center py-8"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-6 animate-spin text-neutral-400"
                  />
                </div>
              }
            >
              <ChatRoom
                key={chat.roomSlug}
                roomName={currentRoom?.name ?? chat.roomSlug}
                maxMembers={currentRoom?.maxMembers}
                session={chat.session}
                ownGuestIds={chat.ownGuestIds}
                connected={chat.status === "connected"}
                members={chat.members}
                messages={chat.messages}
                events={chat.roomEvents}
                showMovements={showMovements}
                error={chat.error}
                retryAfterSeconds={chat.retryAfterSeconds}
                onClearError={chat.clearError}
                onSend={chat.sendMessage}
                onReact={chat.react}
                onReport={chat.reportMessage}
                onAnnounce={chat.sendAnnouncement}
                announcements={chat.announcements}
                direct={chat.direct}
                idleDeadline={chat.idleDeadline}
              />
            </Suspense>
          ) : page === "terms" || page === "privacy" ? (
            <LegalPage page={page} state={legalState} retry={retryLegal} />
          ) : page === "about" ? (
            <AboutPage />
          ) : (
            <div className="space-y-4">
              {!pendingRoom && !moderatorOpen && (
                <ErrorAlert code={chat.error} onDismiss={chat.clearError} />
              )}
              <Lobby
                state={
                  roomsState.status === "ready" && adminRooms.length > 0
                    ? { status: "ready", rooms: knownRooms }
                    : roomsState
                }
                onRetry={retry}
                onSelect={(room) => void handleSelect(room)}
              />
              <LegalLinks />
            </div>
          )}
        </ViewTransition>
      </PageFrame>

      {notificationSoundOpen && (
        <NotificationSoundDialog
          value={notificationSound}
          onChange={changeNotificationSound}
          onClose={() => setNotificationSoundOpen(false)}
        />
      )}

      {profile && !createAccountOpen && (
        <ProfileDialog
          open={profileOpen || accountOpen}
          onClose={closeProfile}
          profile={profile}
          onSave={saveProfile}
          account={account}
          onDelete={deleteMyAccount}
          onCreateAccount={openAccountCreation}
        />
      )}

      {createAccountOpen && profile?.role === "guest" && (
        <CreateAccountDialog
          nickname={profile.nickname}
          returnPath={location.pathname}
          onClaim={claimAccount}
          onClose={() => setCreateAccountOpen(false)}
        />
      )}

      {shownRoom && (
        <NicknameDialog
          open={pendingRoom !== null}
          connecting={chat.status === "connecting"}
          error={chat.error}
          onSubmit={(nickname, avatar, picture) =>
            void handleNickname(nickname, avatar, picture)
          }
          onCancel={handleCancel}
          termsVersion={termsVersion}
          returnPath={roomPath(shownRoom.slug)}
        />
      )}

      {chat.queue && !pendingRoom && (
        <QueueDialog
          room={
            knownRooms.find((room) => room.slug === chat.queue?.roomSlug)
              ?.name ?? chat.queue.roomSlug
          }
          position={chat.queue.position}
          tools={adminTools}
          onClose={() => {
            void chat.cancelQueue();
            if (!chat.roomSlug && slugFromPath(location.pathname))
              navigate(LOBBY_PATH, { replace: true });
          }}
        />
      )}

      {shownElsewhere && !pendingRoom && (
        <TabNotice
          open={elsewhere !== null}
          onUseHere={() => void takeOverRoom()}
          onClose={() => setElsewhere(null)}
        />
      )}

      {moderatorOpen && (
        <ModeratorDialog
          returnPath={location.pathname}
          signingIn={signingIn}
          error={signInError ?? chat.error}
          onSignIn={(email, password) => void handleSignIn(email, password)}
          onCancel={() => {
            setModeratorOpen(false);
            clearDialogErrors();
          }}
        />
      )}
    </>
  );
}
