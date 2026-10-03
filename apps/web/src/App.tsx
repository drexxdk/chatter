import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Room } from "./api";
import type { CreateSocket } from "./chat/socket";
import { useChat } from "./chat/useChat";
import { ChatRoom } from "./components/ChatRoom";
import { ErrorAlert } from "./components/ErrorAlert";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { Lobby, useRooms } from "./components/Lobby";
import { NicknameDialog } from "./components/NicknameDialog";

export function App({ createSocket }: { createSocket?: CreateSocket }) {
  const { t } = useTranslation();
  const chat = useChat(createSocket);
  const { state: roomsState, retry } = useRooms();
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);

  const rooms = roomsState.status === "ready" ? roomsState.rooms : [];
  const currentRoom = rooms.find((room) => room.slug === chat.roomSlug);

  async function handleSelect(room: Room) {
    chat.clearError();

    if (chat.status === "connected") {
      await chat.joinRoom(room.slug);
    } else {
      setPendingRoom(room);
    }
  }

  async function handleNickname(nickname: string) {
    if (!pendingRoom) return;

    if (!(await chat.connect(nickname))) return;

    const { slug } = pendingRoom;
    setPendingRoom(null);
    await chat.joinRoom(slug);
  }

  function handleCancel() {
    setPendingRoom(null);
    chat.clearError();
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("app.title")}</h1>
        <LanguageSwitcher />
      </header>

      <main className="space-y-4">
        {chat.roomSlug && chat.session ? (
          <ChatRoom
            roomName={currentRoom?.name ?? chat.roomSlug}
            session={chat.session}
            members={chat.members}
            messages={chat.messages}
            error={chat.error}
            onSend={chat.sendMessage}
            onLeave={() => void chat.leaveRoom()}
          />
        ) : (
          <>
            {!pendingRoom && <ErrorAlert code={chat.error} />}
            <Lobby
              state={roomsState}
              onRetry={retry}
              onSelect={(room) => void handleSelect(room)}
            />
          </>
        )}
      </main>

      {pendingRoom && (
        <NicknameDialog
          connecting={chat.status === "connecting"}
          error={chat.error}
          onSubmit={(nickname) => void handleNickname(nickname)}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
