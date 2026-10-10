import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageInput } from "./components/MessageInput";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const submitted = vi.fn((event: React.SubmitEvent) => event.preventDefault());
  render(
    <form onSubmit={submitted}>
      <MessageInput aria-label="Message" defaultValue="" />
      <button type="submit">Send</button>
    </form>,
  );

  return { submitted, user: userEvent.setup() };
}

const touchScreen = (touch: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: touch && query === "(hover: none)",
      media: query,
    })),
  );

describe("the Enter key in the message box", () => {
  it("sends with a mouse and keyboard, and Shift+Enter starts a new line", async () => {
    touchScreen(false);
    const { submitted, user } = setup();

    await user.type(screen.getByRole("textbox"), "a{Shift>}{Enter}{/Shift}b");
    expect(submitted).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("starts a new line on a touch screen, where the Send button sends", async () => {
    touchScreen(true);
    const { submitted, user } = setup();

    await user.type(screen.getByRole("textbox"), "a{Enter}b");

    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("a\nb");

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});

describe("the height of the message box", () => {
  it("is fitted again when the box gets narrower or wider, not only when the words change", () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(<MessageInput aria-label="Message" defaultValue="some words" />);
    const box = screen.getByRole("textbox");
    let lines = 36;
    let width = 400;
    Object.defineProperty(box, "scrollHeight", { get: () => lines });
    Object.defineProperty(box, "offsetWidth", { get: () => width });

    notify();
    expect(box.style.height).toBe("36px");

    // The same width: nothing to do (and no loop from the box changing its own height).
    box.style.height = "1px";
    notify();
    expect(box.style.height).toBe("1px");

    width = 200;
    lines = 84;
    notify();
    expect(box.style.height).toBe("84px");
  });
});
