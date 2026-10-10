import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SignInError, signInModerator, type Room } from "./api";
import { PLAIN_AVATAR, type Avatar } from "./chat/avatar";
import type { CreateSocket } from "./chat/socket";
import { useChat } from "./chat/useChat";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import { ChatRoom } from "./components/ChatRoom";
import { ErrorAlert } from "./components/ErrorAlert";
import { InfoPanel } from "./components/InfoPanel";
import { Lobby, useRooms } from "./components/Lobby";
import { MainMenu } from "./components/MainMenu";
import { NicknameDialog } from "./components/NicknameDialog";
import { ProfileButton } from "./components/ProfileButton";
import { ProfileDialog } from "./components/ProfileDialog";
import { RoomSwitcher } from "./components/RoomSwitcher";
import { SideDrawer } from "./components/SideDrawer";
import { LOBBY_PATH, roomPath, slugFromPath } from "./place";
import { loadShowMovements, saveShowMovements } from "./preferences";
import {
  clearSession,
  loadDirect,
  loadSession,
  rememberConnection,
  rememberProfile,
  saveDirect,
  saveSession,
} from "./session";

// The server's answer when somebody else in the room already has the guest's nickname.
const NAME_TAKEN = "nickname_taken";

export function App({
  createSocket,
  reconnectDelaysMs,
}: {
  createSocket?: CreateSocket;
  reconnectDelaysMs?: number[];
}) {
  const { t } = useTranslation();
  const chat = useChat(createSocket, { reconnectDelaysMs });
  const { state: roomsState, retry } = useRooms();
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showMovements, setShowMovements] = useState(loadShowMovements);

  function changeShowMovements(show: boolean) {
    setShowMovements(show);
    saveShowMovements(show);
  }

  const rooms = roomsState.status === "ready" ? roomsState.rooms : [];
  const currentRoom = rooms.find((room) => room.slug === chat.roomSlug);

  const resumeDetails = () => {
    const resume = chat.resume();
    return resume ? { resume } : {};
  };

  async function handleSelect(room: Room) {
    chat.clearError();

    if (chat.status === "connected") {
      const joined = await chat.joinRoom(room.slug);

      // Somebody in that room has the guest's name: they are asked for another.
      if (!joined.ok && joined.error === NAME_TAKEN) setPendingRoom(room);
    } else {
      setPendingRoom(room);
    }
  }

  async function handleNickname(
    nickname: string,
    avatar: Avatar,
    age?: number,
  ) {
    if (!pendingRoom) return;

    // The plain avatar is what the server gives anyone who sends none, so it is not sent or kept.
    const chosen = avatar === PLAIN_AVATAR ? undefined : avatar;

    if (!(await chat.connect(nickname, { avatar: chosen, age }))) return;

    saveSession({
      nickname,
      ...(chosen ? { avatar: chosen } : {}),
      ...(age === undefined ? {} : { age }),
      guestIds: chat.guestIds(),
      ...resumeDetails(),
    });
    const room = pendingRoom;

    // The name may be somebody else's in that room: then the dialog stays, with the reason, for another one.
    const joined = await chat.joinRoom(room.slug);
    if (joined.ok || joined.error !== NAME_TAKEN) setPendingRoom(null);
  }

  async function handleSignIn(email: string, password: string) {
    if (!pendingRoom) return;

    setSignInError(null);
    chat.clearError();
    setSigningIn(true);

    try {
      const moderator = await signInModerator(email, password);

      if (!(await chat.connect(moderator.name, { token: moderator.token })))
        return;

      saveSession({
        nickname: moderator.name,
        token: moderator.token,
        guestIds: chat.guestIds(),
        ...resumeDetails(),
      });
      const { slug } = pendingRoom;
      setPendingRoom(null);
      await chat.joinRoom(slug);
    } catch (cause) {
      setSignInError(cause instanceof SignInError ? cause.code : "connection");
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
    if (!chat.roomSlug && slugFromPath(window.location.pathname)) {
      window.history.replaceState(null, "", LOBBY_PATH);
    }
  }

  // The address says where the guest is, so a reload (or a shared link) can put them back. Entering a room adds a
  // history entry and leaving adds another, which is what makes the browser's back button leave the room.
  const previousRoom = useRef<string | null>(null);
  useEffect(() => {
    const slug = chat.roomSlug;

    if (slug) {
      if (window.location.pathname !== roomPath(slug)) {
        window.history.pushState(null, "", roomPath(slug));
      }
    } else if (
      previousRoom.current &&
      window.location.pathname !== LOBBY_PATH
    ) {
      window.history.pushState(null, "", LOBBY_PATH);
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
  }, [chat.ownGuestIds, chat.session]);

  // A change to the profile is what a reload has to bring the guest back as.
  useEffect(() => {
    if (chat.session && chat.session.role !== "moderator") {
      rememberProfile({
        nickname: chat.session.nickname,
        avatar: chat.session.avatar,
        age: chat.session.age,
      });
    }
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
  // or ask who they are.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || roomsState.status !== "ready") return;
    restored.current = true;

    const slug = slugFromPath(window.location.pathname);
    if (!slug) return;

    const room = roomsState.rooms.find((candidate) => candidate.slug === slug);

    if (!room) {
      window.history.replaceState(null, "", LOBBY_PATH);
      return;
    }

    const saved = loadSession();

    if (!saved) {
      setPendingRoom(room);
      return;
    }

    void (async () => {
      const direct = loadDirect();
      const connected = await chat.connect(saved.nickname, {
        token: saved.token,
        avatar: saved.avatar,
        age: saved.age,
        previousGuestIds: saved.guestIds,
        resume: saved.resume,
        threads: direct.threads,
        blockedIds: direct.blockedIds,
        openGuestId: direct.openGuestId,
      });

      if (!connected) {
        // Whatever was saved no longer works, so it must not be tried again.
        clearSession();
        setPendingRoom(room);
        return;
      }

      saveSession({
        ...saved,
        guestIds: chat.guestIds(),
        ...resumeDetails(),
      });

      const joined = await chat.joinRoom(room.slug);

      if (!joined.ok) {
        // Somebody in the room has the guest's name: they are asked for another instead of being sent away.
        if (joined.error === NAME_TAKEN) setPendingRoom(room);
        else window.history.replaceState(null, "", LOBBY_PATH);
      }
    })();
  });

  // The back and forward buttons: the address changed under us, so the room follows it.
  const latest = useRef({ chat, rooms, handleSelect });
  latest.current = { chat, rooms, handleSelect };
  useEffect(() => {
    const onPopState = () => {
      const { chat, rooms, handleSelect } = latest.current;
      const slug = slugFromPath(window.location.pathname);

      if (!slug) {
        setPendingRoom(null);
        if (chat.roomSlug) void chat.leaveRoom();
        return;
      }

      const room = rooms.find((candidate) => candidate.slug === slug);
      if (room && slug !== chat.roomSlug) void handleSelect(room);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4 sm:px-6">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 bg-slate-950">
        {chat.roomSlug && chat.session ? (
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="sr-only">{t("app.title")}</h1>
            <button
              type="button"
              onClick={() => void chat.leaveRoom()}
              aria-label={t("room.leave")}
              className="shrink-0 rounded-md p-2 hover:bg-slate-800"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <RoomSwitcher
              rooms={rooms}
              slug={chat.roomSlug}
              name={currentRoom?.name ?? chat.roomSlug}
              disabled={chat.status !== "connected"}
              onSelect={(room) => void handleSelect(room)}
            />
          </div>
        ) : (
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
        )}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {chat.roomSlug && chat.session && (
            <ProfileButton
              nickname={chat.session.nickname}
              avatar={chat.session.avatar}
              onClick={() => setProfileOpen(true)}
            />
          )}
          <MainMenu
            onInfo={() => setInfoOpen(true)}
            movements={
              chat.roomSlug && chat.session && !chat.direct.active
                ? { checked: showMovements, onChange: changeShowMovements }
                : undefined
            }
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        {chat.announcement && (
          <AnnouncementBanner
            announcement={chat.announcement}
            onDismiss={chat.dismissAnnouncement}
          />
        )}
        {chat.roomSlug && chat.session ? (
          <ChatRoom
            key={chat.roomSlug}
            roomName={currentRoom?.name ?? chat.roomSlug}
            session={chat.session}
            ownGuestIds={chat.ownGuestIds}
            connected={chat.status === "connected"}
            members={chat.members}
            messages={chat.messages}
            events={chat.roomEvents}
            showMovements={showMovements}
            error={chat.error}
            retryAfterSeconds={chat.retryAfterSeconds}
            onSend={chat.sendMessage}
            onReact={chat.react}
            onAnnounce={chat.sendAnnouncement}
            direct={chat.direct}
          />
        ) : (
          <div className="space-y-4 pb-6">
            {!pendingRoom && <ErrorAlert code={chat.error} />}
            <Lobby
              state={roomsState}
              onRetry={retry}
              onSelect={(room) => void handleSelect(room)}
            />
          </div>
        )}
      </main>

      <SideDrawer
        open={infoOpen}
        title={t("info.title")}
        onClose={() => setInfoOpen(false)}
      >
        <InfoPanel slowModeSeconds={currentRoom?.slowModeSeconds} />
      </SideDrawer>

      {chat.session && (
        <ProfileDialog
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          session={chat.session}
          onSave={chat.updateProfile}
        />
      )}

      {pendingRoom && (
        <NicknameDialog
          connecting={chat.status === "connecting"}
          signingIn={signingIn}
          error={signInError ?? chat.error}
          onSubmit={(nickname, avatar, age) =>
            void handleNickname(nickname, avatar, age)
          }
          onSignIn={(email, password) => void handleSignIn(email, password)}
          onModeChange={clearDialogErrors}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
