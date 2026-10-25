import type { TFunction } from "i18next";
import {
  CircleCheck,
  Info,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Toaster, toast } from "sonner";

import { Button } from "./Button";

type SettingsError = "load-error" | "save-error";
const SETTINGS_ERROR_ID = "notification-preferences-error";

export const TOAST_PREVIEW_KINDS = [
  "default",
  "success",
  "info",
  "warning",
  "error",
  "loading",
  "action",
  "promise",
] as const;
export type ToastPreview = (typeof TOAST_PREVIEW_KINDS)[number];

export function dismissToastPreviews() {
  TOAST_PREVIEW_KINDS.forEach((kind) =>
    toast.dismiss(`admin-toast-preview-${kind}`),
  );
}

export function showToastPreview(kind: ToastPreview, t: TFunction) {
  const id = `admin-toast-preview-${kind}`;
  const options = {
    id,
    duration: kind === "loading" ? Infinity : 5000,
    classNames: {
      toast:
        "relative flex w-full items-start gap-3 rounded-md border border-neutral-600 bg-neutral-900 p-4 text-sm text-neutral-100 shadow-lg data-[type=success]:border-emerald-400/50 data-[type=info]:border-sky-400/50 data-[type=warning]:border-amber-400/50 data-[type=error]:border-red-400/50",
      content: "min-w-0 flex-1",
      title: "wrap-break-word",
      icon: "mt-0.5 shrink-0",
      actionButton:
        "button-outline shrink-0 rounded-md bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700",
    },
    cancel: (
      <Button
        variant="icon"
        icon={X}
        className="size-11 shrink-0 sm:size-8"
        aria-label={t("notice.dismiss")}
        title={t("notice.dismiss")}
        onClick={() => toast.dismiss(id)}
      />
    ),
  };
  if (kind === "promise") {
    return toast.promise(
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      {
        ...options,
        loading: t("admin.toasts.messages.loading"),
        success: t("admin.toasts.messages.success"),
        error: t("admin.toasts.messages.error"),
      },
    );
  }
  const message = t(`admin.toasts.messages.${kind}`);
  if (kind === "action") {
    return toast.message(message, {
      ...options,
      action: {
        label: (
          <span className="inline-flex items-center gap-1">
            <Undo2 aria-hidden="true" className="size-4" />
            {t("admin.toasts.undo")}
          </span>
        ),
        onClick: () => toast.message(t("admin.toasts.undone"), options),
      },
    });
  }
  return kind === "default"
    ? toast.message(message, options)
    : toast[kind](message, options);
}

function SettingsErrorToast({
  status,
  onRetry,
}: {
  status: SettingsError;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-red-400/40 bg-neutral-900 p-4 text-sm text-neutral-100 shadow-lg"
    >
      <p className="flex min-w-0 items-start gap-2">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-red-300"
        />
        <span className="min-w-0 wrap-break-word">
          {t(`notifications.${status}`)}
        </span>
      </p>
      <Button
        variant="icon"
        icon={X}
        className="size-11 sm:size-8"
        aria-label={t("notice.dismiss")}
        title={t("notice.dismiss")}
        onClick={() => toast.dismiss(SETTINGS_ERROR_ID)}
      />
      <Button
        icon={RotateCw}
        className="min-h-11 justify-self-start sm:min-h-8"
        onClick={() => {
          onRetry();
          toast.dismiss(SETTINGS_ERROR_ID);
        }}
      >
        {t("notifications.retry")}
      </Button>
    </div>
  );
}

export function showSettingsErrorToast(
  status: SettingsError,
  onRetry: () => void,
) {
  toast.custom(() => <SettingsErrorToast status={status} onRetry={onRetry} />, {
    id: SETTINGS_ERROR_ID,
    duration: Infinity,
  });
}

export function dismissSettingsErrorToast() {
  toast.dismiss(SETTINGS_ERROR_ID);
}

export function AppToaster() {
  const { t } = useTranslation();
  const offset = {
    top: "calc(var(--header-height, 3.5625rem) + 0.75rem)",
    right: "var(--page-gutter, 1rem)",
    left: "var(--page-gutter, 1rem)",
  };
  return (
    <Toaster
      position="top-right"
      expand
      offset={offset}
      mobileOffset={offset}
      containerAriaLabel={t("admin.toasts.title")}
      icons={{
        success: <CircleCheck className="size-4 text-emerald-300" />,
        info: <Info className="size-4 text-sky-300" />,
        warning: <TriangleAlert className="size-4 text-amber-300" />,
        error: <TriangleAlert className="size-4 text-red-300" />,
        loading: (
          <LoaderCircle className="size-4 animate-spin text-neutral-300 motion-reduce:animate-none" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: { toast: "w-full", content: "w-full" },
      }}
    />
  );
}
