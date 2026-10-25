import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSidebarPreference, updateSidebarPreference } from "./api";
import { loadSidebarOpen, saveSidebarOpen } from "./preferences";
import { useSidebarPreference } from "./useSidebarPreference";

vi.mock("./api", () => ({
  fetchSidebarPreference: vi.fn(),
  updateSidebarPreference: vi.fn(),
}));

describe("sidebar preference synchronization", () => {
  beforeEach(() => {
    vi.mocked(fetchSidebarPreference).mockReset().mockResolvedValue(false);
    vi.mocked(updateSidebarPreference).mockReset().mockResolvedValue();
  });

  it("keeps guests in local storage without account requests", () => {
    const { result } = renderHook(() => useSidebarPreference());
    act(() => result.current.change(false));
    expect(loadSidebarOpen()).toBe(false);
    expect(fetchSidebarPreference).not.toHaveBeenCalled();
    expect(updateSidebarPreference).not.toHaveBeenCalled();
  });

  it("loads and saves the account value without overwriting the guest preference", async () => {
    saveSidebarOpen(true);
    const { result, rerender } = renderHook(
      ({ token }: { token?: string }) => useSidebarPreference(token),
      { initialProps: { token: "account-a" as string | undefined } },
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.open).toBe(false);
    act(() => result.current.change(true));
    await waitFor(() =>
      expect(updateSidebarPreference).toHaveBeenCalledWith("account-a", true),
    );
    expect(loadSidebarOpen()).toBe(true);
    rerender({ token: undefined });
    expect(result.current.open).toBe(true);
  });

  it("ignores a delayed load after the user changes the preference", async () => {
    let finish!: (open: boolean) => void;
    vi.mocked(fetchSidebarPreference).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSidebarPreference("account-a"));
    await waitFor(() => expect(fetchSidebarPreference).toHaveBeenCalled());
    act(() => result.current.change(false));
    await act(async () => finish(true));
    expect(result.current.open).toBe(false);
  });

  it("ignores a delayed response after switching accounts", async () => {
    let finish!: (open: boolean) => void;
    vi.mocked(fetchSidebarPreference).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ token }) => useSidebarPreference(token),
      { initialProps: { token: "account-a" } },
    );
    await waitFor(() =>
      expect(fetchSidebarPreference).toHaveBeenCalledWith("account-a"),
    );
    rerender({ token: "account-b" });
    await waitFor(() => expect(result.current.status).toBe("saved"));
    await act(async () => finish(true));
    expect(result.current.open).toBe(false);
  });

  it("serializes saves so rapid toggles cannot finish out of order", async () => {
    let finish!: () => void;
    vi.mocked(updateSidebarPreference).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSidebarPreference("account-a"));
    await waitFor(() => expect(result.current.status).toBe("saved"));
    act(() => {
      result.current.change(true);
      result.current.change(false);
    });
    await waitFor(() =>
      expect(updateSidebarPreference).toHaveBeenCalledTimes(1),
    );
    await act(async () => finish());
    await waitFor(() =>
      expect(updateSidebarPreference).toHaveBeenCalledTimes(2),
    );
    expect(updateSidebarPreference).toHaveBeenLastCalledWith(
      "account-a",
      false,
    );
    expect(result.current.open).toBe(false);
  });

  it("does not save defaults after a failed load and recovers from a failed write", async () => {
    vi.mocked(fetchSidebarPreference).mockRejectedValueOnce(
      new Error("offline"),
    );
    const { result } = renderHook(() => useSidebarPreference("account-a"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(updateSidebarPreference).not.toHaveBeenCalled();
    vi.mocked(updateSidebarPreference).mockRejectedValueOnce(
      new Error("offline"),
    );
    act(() => result.current.change(false));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.change(true));
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });
});
