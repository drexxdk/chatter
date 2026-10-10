import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchRooms, type Room } from "../api";

type RoomsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rooms: Room[] };

export function useRooms() {
  const [state, setState] = useState<RoomsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchRooms(controller.signal)
      .then((rooms) => setState({ status: "ready", rooms }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}

interface LobbyProps {
  state: RoomsState;
  onRetry: () => void;
  onSelect: (room: Room) => void;
}

export function Lobby({ state, onRetry, onSelect }: LobbyProps) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="lobby-heading" className="space-y-4">
      <div>
        <h2 id="lobby-heading" className="text-xl font-semibold">
          {t("lobby.heading")}
        </h2>
        <p className="text-neutral-400">{t("lobby.intro")}</p>
      </div>

      {state.status === "loading" && <p role="status">{t("lobby.loading")}</p>}

      {state.status === "error" && (
        <div role="alert" className="space-y-2">
          <p className="text-red-200">{t("lobby.loadError")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700"
          >
            {t("lobby.retry")}
          </button>
        </div>
      )}

      {state.status === "ready" && state.rooms.length === 0 && (
        <p>{t("lobby.empty")}</p>
      )}

      {state.status === "ready" && state.rooms.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {state.rooms.map((room) => (
            <li
              key={room.id}
              className="flex flex-col justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
            >
              <div>
                <h3 className="font-medium">{room.name}</h3>
                {room.description && (
                  <p className="text-sm text-neutral-400">{room.description}</p>
                )}
                {typeof room.maxMembers === "number" && (
                  <p className="mt-1 text-xs text-neutral-500">
                    {t("lobby.capacity", { count: room.maxMembers })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelect(room)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500"
              >
                {t("lobby.join", { name: room.name })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
