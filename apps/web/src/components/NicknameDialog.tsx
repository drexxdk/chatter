import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { normalizeNickname } from "../nickname";
import { ErrorAlert } from "./ErrorAlert";

interface NicknameDialogProps {
  connecting: boolean;
  error: string | null;
  onSubmit: (nickname: string) => void;
  onCancel: () => void;
}

export function NicknameDialog({
  connecting,
  error,
  onSubmit,
  onCancel,
}: NicknameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const nickname = normalizeNickname(value);
  const showInvalid = touched && !nickname;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (nickname) onSubmit(nickname);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-title"
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-5"
      >
        <h2 id="nickname-title" className="text-lg font-semibold">
          {t("nickname.title")}
        </h2>

        <div className="space-y-1">
          <label htmlFor="nickname" className="block text-sm font-medium">
            {t("nickname.label")}
          </label>
          <input
            id="nickname"
            autoFocus
            autoComplete="nickname"
            maxLength={24}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={showInvalid}
            aria-describedby="nickname-hint"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
          <p
            id="nickname-hint"
            className={
              showInvalid ? "text-sm text-red-300" : "text-sm text-slate-500"
            }
          >
            {t("nickname.hint")}
          </p>
        </div>

        <ErrorAlert code={error} />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 hover:bg-slate-800"
          >
            {t("nickname.cancel")}
          </button>
          <button
            type="submit"
            disabled={connecting}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500 disabled:opacity-60"
          >
            {connecting ? t("nickname.connecting") : t("nickname.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
