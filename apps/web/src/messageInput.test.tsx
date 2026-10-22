import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useComposer } from "./chat/useComposer";
import { MessageInput } from "./components/MessageInput";
import { editorOf, fillBox } from "./test/app";

afterEach(() => vi.unstubAllGlobals());

function Harness({
  onSubmit,
  draftKey,
  draftRecipient,
}: {
  onSubmit: (event: React.SubmitEvent) => void;
  draftKey?: string;
  draftRecipient?: string;
}) {
  const composer = useComposer(draftKey, draftRecipient);

  return (
    <form onSubmit={onSubmit}>
      <span id="label">Message</span>
      <MessageInput
        id="message"
        labelledBy="label"
        composer={composer}
        placeholder="Write something"
        disabled={false}
      />
      <output aria-label="Sent as">{composer.text}</output>
      <button type="submit">Send</button>
    </form>
  );
}

function setup() {
  const submitted = vi.fn((event: React.SubmitEvent) => event.preventDefault());
  render(<Harness onSubmit={submitted} />);

  return {
    submitted,
    user: userEvent.setup(),
    box: screen.getByRole("textbox", { name: "Message" }),
  };
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
    const { submitted, user, box } = setup();

    await user.type(box, "a{Shift>}{Enter}{/Shift}b");
    expect(submitted).not.toHaveBeenCalled();
    expect(box).toHaveDraft("a\nb");

    await user.keyboard("{Enter}");
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("starts a new line on a touch screen, where the Send button sends", async () => {
    touchScreen(true);
    const { submitted, user, box } = setup();

    await user.type(box, "a{Enter}b");

    expect(submitted).not.toHaveBeenCalled();
    expect(box).toHaveDraft("a\nb");

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});

describe("what the box holds", () => {
  it("never restores an inline private reply into a public composer", async () => {
    const submitted = vi.fn();
    const first = render(
      <Harness
        onSubmit={submitted}
        draftKey="test:reply"
        draftRecipient="bob"
      />,
    );
    await userEvent
      .setup()
      .type(
        await screen.findByRole("textbox", { name: "Message" }),
        "only for Bob",
      );
    first.unmount();
    render(<Harness onSubmit={submitted} draftKey="test:reply" />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveDraft(""),
    );
    expect(submitted).not.toHaveBeenCalled();
  });

  it("restores a private draft into the editor without submitting it", async () => {
    const submitted = vi.fn((event: React.SubmitEvent) =>
      event.preventDefault(),
    );
    const first = render(
      <Harness onSubmit={submitted} draftKey="test:public" />,
    );
    const box = await screen.findByRole("textbox", { name: "Message" });
    await userEvent
      .setup()
      .type(box, "private <words>{Shift>}{Enter}{/Shift}second line");
    first.unmount();
    const second = render(
      <Harness onSubmit={submitted} draftKey="test:public" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveDraft(
        "private <words>\nsecond line",
      ),
    );
    expect(submitted).not.toHaveBeenCalled();
    second.unmount();
    render(<Harness onSubmit={submitted} draftKey="test:private:bob" />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveDraft(""),
    );
  });

  it("is reported as the words that are sent, line breaks included", async () => {
    const { user, box } = setup();

    await user.type(box, "one{Shift>}{Enter}{/Shift}two");

    expect(screen.getByLabelText("Sent as")).toHaveTextContent("one two");
    expect(screen.getByLabelText("Sent as").textContent).toBe("one\ntwo");
  });

  it("shows what to write while it is empty, and not after", async () => {
    const { user, box } = setup();
    expect(screen.getByText("Write something")).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-placeholder", "Write something");

    await user.type(box, "x");

    expect(screen.queryByText("Write something")).toBeNull();
  });

  describe("pasted", () => {
    const paste = (box: HTMLElement, text: string, html = "") =>
      fireEvent.paste(box, {
        clipboardData: {
          types: html ? ["text/plain", "text/html"] : ["text/plain"],
          getData: (type: string) =>
            type === "text/plain" ? text : type === "text/html" ? html : "",
        },
      });

    it("is words, with the line breaks kept", () => {
      const { box } = setup();

      paste(box, "one\r\ntwo\nthree");

      expect(box).toHaveDraft("one\ntwo\nthree");
      expect(screen.getByLabelText("Sent as").textContent).toBe(
        "one\ntwo\nthree",
      );
    });

    it("has no formatting", () => {
      const { box } = setup();

      paste(box, "bold", "<b>bold</b>");

      expect(box).toHaveDraft("bold");
      expect(box.querySelector("b, strong")).toBeNull();
    });

    it("is cut to what fits", async () => {
      const { box } = setup();
      fillBox(box, "x".repeat(490));

      paste(box, "y".repeat(50));

      expect(box.textContent).toBe("x".repeat(490) + "y".repeat(10));
    });
  });
  it("is no longer than a message can be", async () => {
    const { box } = setup();

    fillBox(box, "x".repeat(600));
    expect(box.textContent).toHaveLength(0);

    fillBox(box, "x".repeat(500));
    fillBox(box, "y");

    expect(box.textContent).toHaveLength(500);
  });

  it("is a text box to assistive technology, named by its label", () => {
    const { box } = setup();

    expect(box).toHaveAttribute("aria-multiline", "true");
    expect(box).toHaveAttribute("id", "message");
    expect(editorOf(box).isEditable).toBe(true);
  });
});

describe("keeping the page at its end when the box grows", () => {
  function observe() {
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

    return () => act(() => notify());
  }

  const page = (scrollHeight: number, scrollTop: number) => {
    const root = document.documentElement;
    Object.defineProperty(root, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(root, "clientHeight", {
      configurable: true,
      get: () => 800,
    });
    root.scrollTop = scrollTop;

    return root;
  };

  it("scrolls to the end when the guest was there before it grew", () => {
    const notify = observe();
    const { box } = setup();
    let height = 40;
    Object.defineProperty(box, "offsetHeight", { get: () => height });
    const root = page(2000, 1160);

    height = 112;
    page(2072, 1160);
    notify();

    expect(root.scrollTop).toBe(2072);
  });

  it("leaves the page alone when the guest had scrolled up", () => {
    const notify = observe();
    const { box } = setup();
    let height = 40;
    Object.defineProperty(box, "offsetHeight", { get: () => height });
    const root = page(2000, 300);

    height = 112;
    page(2072, 300);
    notify();

    expect(root.scrollTop).toBe(300);
  });
});
