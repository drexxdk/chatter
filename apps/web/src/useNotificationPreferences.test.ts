import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "./api";
import { loadNotificationSound, saveNotificationSound } from "./preferences";
import { useNotificationPreferences } from "./useNotificationPreferences";
import { useSettingsErrorToast } from "./useSettingsErrorToast";
import {
  dismissSettingsErrorToast,
  showSettingsErrorToast,
} from "./components/AppToaster";

vi.mock("./components/AppToaster", () => ({
  dismissSettingsErrorToast: vi.fn(),
  showSettingsErrorToast: vi.fn(),
}));

vi.mock("./api", () => ({
  fetchNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

describe("notification preference synchronization", () => {
  const saved = {
    enabled: true,
    volume: 0.3,
    warnings: { enabled: true, sound: "bell" as const },
  };
  beforeEach(() => {
    vi.mocked(showSettingsErrorToast).mockClear();
    vi.mocked(dismissSettingsErrorToast).mockClear();
    vi.mocked(fetchNotificationPreferences)
      .mockReset()
      .mockResolvedValue(saved);
    vi.mocked(updateNotificationPreferences).mockReset().mockResolvedValue();
  });

  it("keeps guest settings in localStorage without account requests", () => {
    const { result } = renderHook(() => useNotificationPreferences());
    act(() => result.current.change(saved));
    expect(loadNotificationSound()).toEqual(saved);
    expect(fetchNotificationPreferences).not.toHaveBeenCalled();
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("reports a delayed save failure after closing settings and retries the latest value", async () => {
    let failSave!: (reason: Error) => void;
    vi.mocked(updateNotificationPreferences).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failSave = reject;
        }),
    );
    const { result, rerender } = renderHook(
      ({ open }) => {
        const preferences = useNotificationPreferences("account-a");
        useSettingsErrorToast(preferences, open);
        return preferences;
      },
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(showSettingsErrorToast).not.toHaveBeenCalled();
    const changed = { ...saved, volume: 0.7 };
    act(() => {
      result.current.change(changed);
      result.current.flush();
    });
    rerender({ open: false });
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledOnce(),
    );
    await act(async () => failSave(new Error("offline")));
    expect(showSettingsErrorToast).toHaveBeenCalledExactlyOnceWith(
      "save-error",
      expect.any(Function),
    );
    act(() => vi.mocked(showSettingsErrorToast).mock.calls[0][1]());
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(updateNotificationPreferences).toHaveBeenLastCalledWith(
      "account-a",
      changed,
    );
    expect(dismissSettingsErrorToast).toHaveBeenCalled();
  });

  it("keeps errors inline while settings are open and switches back when reopened", async () => {
    vi.mocked(updateNotificationPreferences).mockRejectedValueOnce(
      new Error("offline"),
    );
    const { result, rerender } = renderHook(
      ({ open }) => {
        const preferences = useNotificationPreferences("account-a");
        useSettingsErrorToast(preferences, open);
        return preferences;
      },
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    act(() => {
      result.current.change({ ...saved, volume: 0.7 });
      result.current.flush();
    });
    await waitFor(() => expect(result.current.status).toBe("save-error"));
    expect(showSettingsErrorToast).not.toHaveBeenCalled();
    rerender({ open: false });
    expect(showSettingsErrorToast).toHaveBeenCalledOnce();
    vi.mocked(dismissSettingsErrorToast).mockClear();
    rerender({ open: true });
    expect(dismissSettingsErrorToast).toHaveBeenCalledOnce();
  });

  it("loads from the database and preserves the guest's settings on sign-out", async () => {
    const guest = { enabled: false, volume: 0.8 };
    saveNotificationSound(guest);
    const { result, rerender } = renderHook(
      ({ token }: { token?: string }) => useNotificationPreferences(token),
      { initialProps: { token: "account-a" as string | undefined } },
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.value).toEqual(saved);
    const changed = { ...saved, volume: 0.6 };
    act(() => {
      result.current.change(changed);
      result.current.flush();
    });
    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        "account-a",
        changed,
      ),
    );
    expect(loadNotificationSound()).toEqual(guest);
    rerender({ token: undefined });
    expect(result.current.value).toEqual(guest);
  });

  it("ignores a delayed response after switching accounts", async () => {
    let finish!: (value: typeof saved) => void;
    vi.mocked(fetchNotificationPreferences).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ token }) => useNotificationPreferences(token),
      { initialProps: { token: "account-a" } },
    );
    await waitFor(() =>
      expect(fetchNotificationPreferences).toHaveBeenCalledWith("account-a"),
    );
    rerender({ token: "account-b" });
    await waitFor(() => expect(result.current.status).toBe("saved"));
    await act(async () => finish({ ...saved, volume: 0.9 }));
    expect(result.current.value).toEqual(saved);
  });

  it("debounces volume changes and reports a failed save that can be retried", async () => {
    const { result } = renderHook(() =>
      useNotificationPreferences("account-a"),
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    vi.mocked(updateNotificationPreferences).mockRejectedValueOnce(
      new Error("offline"),
    );
    act(() => {
      result.current.change({ ...saved, volume: 0.1 });
      result.current.change({ ...saved, volume: 0.7 });
      result.current.flush();
    });
    await waitFor(() => expect(result.current.status).toBe("save-error"));
    expect(updateNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(updateNotificationPreferences).toHaveBeenLastCalledWith(
      "account-a",
      { ...saved, volume: 0.7 },
    );
    act(() => {
      result.current.retry();
      result.current.flush();
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("retries failed loads without writing defaults to the account", async () => {
    vi.mocked(fetchNotificationPreferences).mockRejectedValueOnce(
      new Error("offline"),
    );
    const { result } = renderHook(() =>
      useNotificationPreferences("account-a"),
    );
    await waitFor(() => expect(result.current.status).toBe("load-error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.value).toEqual(saved);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });
});
