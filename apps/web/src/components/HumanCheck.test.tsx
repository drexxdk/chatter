import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  TurnstileInstance,
  TurnstileProps,
} from "@marsidev/react-turnstile";
import type { Ref } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HumanCheck } from "./HumanCheck";
import { NicknameDialog } from "./NicknameDialog";
import { ModeratorDialog } from "./ModeratorDialog";

const widget = vi.hoisted(() => ({
  props: undefined as TurnstileProps | undefined,
  reset: vi.fn(),
}));
vi.mock("@marsidev/react-turnstile", async () => {
  const { createElement, useImperativeHandle } = await import("react");
  return {
    Turnstile: (props: TurnstileProps & { ref: Ref<TurnstileInstance> }) => {
      widget.props = props;
      useImperativeHandle(
        props.ref,
        () => ({ reset: widget.reset }) as unknown as TurnstileInstance,
      );
      return createElement("div", { "data-testid": "human-widget" });
    },
  };
});

beforeEach(() => {
  widget.reset.mockClear();
  widget.props = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        providers: ["google"],
        turnstileSiteKey: "public-site-key",
      }),
    ),
  );
});

describe("human verification forms", () => {
  it("blocks guest submission until verified without blocking provider links", async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    render(
      <NicknameDialog
        open
        connecting={false}
        error={null}
        onSubmit={submit}
        onCancel={() => {}}
        termsVersion={null}
        returnPath="/rooms/general"
      />,
    );
    await screen.findByTestId("human-widget");
    await user.type(screen.getByLabelText("Nickname"), "Alice");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute("href", expect.stringContaining("/auth/google/start"));
    fireEvent.submit(
      screen.getByRole("button", { name: "Continue" }).closest("form")!,
    );
    expect(submit).not.toHaveBeenCalled();
    expect(widget.props?.options).toMatchObject({
      action: "guest_join",
      theme: "dark",
      size: "flexible",
    });
    act(() => widget.props?.onSuccess?.("guest-human-token"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(submit).toHaveBeenCalledWith(
      "Alice",
      "other",
      expect.any(String),
      "guest-human-token",
    );
    expect(
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ).not.toContain("guest-human-token");
  });

  it("passes a password challenge to account sign-in", async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    render(
      <ModeratorDialog
        signingIn={false}
        error={null}
        onSignIn={submit}
        onCancel={() => {}}
        returnPath="/"
      />,
    );
    await screen.findByTestId("human-widget");
    await user.type(screen.getByLabelText("Username or email"), "alice");
    await user.type(screen.getByLabelText("Password"), "PrivatePassword123");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(widget.props?.options?.action).toBe("password_login");
    act(() => widget.props?.onSuccess?.("login-human-token"));
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(submit).toHaveBeenCalledWith(
      "alice",
      "PrivatePassword123",
      "login-human-token",
    );
  });

  it.each(["expire", "timeout", "error"])(
    "clears verification on %s",
    async (event) => {
      const token = vi.fn();
      render(<HumanCheck action="guest_join" busy={false} onToken={token} />);
      await screen.findByTestId("human-widget");
      act(() => widget.props?.onSuccess?.("token"));
      expect(token).toHaveBeenLastCalledWith("token");
      act(() => {
        if (event === "expire") widget.props?.onExpire?.("token");
        else if (event === "timeout") widget.props?.onTimeout?.();
        else widget.props?.onError?.("network");
      });
      expect(token).toHaveBeenLastCalledWith(null);
      if (event === "error")
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Human verification",
        );
    },
  );

  it("resets the consumed widget after an attempt finishes", async () => {
    const token = vi.fn();
    const { rerender } = render(
      <HumanCheck action="password_login" busy={false} onToken={token} />,
    );
    await screen.findByTestId("human-widget");
    act(() => widget.props?.onSuccess?.("spent-token"));
    widget.reset.mockClear();
    rerender(<HumanCheck action="password_login" busy onToken={token} />);
    expect(widget.reset).not.toHaveBeenCalled();
    rerender(
      <HumanCheck action="password_login" busy={false} onToken={token} />,
    );
    expect(widget.reset).toHaveBeenCalledOnce();
    expect(token).toHaveBeenLastCalledWith(null);
  });

  it("does not load the widget when verification is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ providers: [] })),
    );
    const token = vi.fn();
    render(<HumanCheck action="guest_join" busy={false} onToken={token} />);
    await waitFor(() => expect(token).toHaveBeenLastCalledWith(""));
    expect(screen.queryByTestId("human-widget")).toBeNull();
  });

  it("does not enable submission if configuration cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const token = vi.fn();
    render(<HumanCheck action="guest_join" busy={false} onToken={token} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Human verification",
    );
    expect(token).toHaveBeenLastCalledWith(null);
  });
});
