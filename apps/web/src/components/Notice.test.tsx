import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ban } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Notice } from "./Notice";

describe("Notice", () => {
  it("keeps the decorative icon hidden from screen readers", () => {
    const { container } = render(
      <Notice role="status" icon={Ban}>
        Blocked
      </Notice>,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("can be closed, with a button that has the name it is given", async () => {
    const onDismiss = vi.fn();

    render(
      <Notice role="alert" onDismiss={onDismiss} dismissLabel="Close message">
        Broken
      </Notice>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Close message" }),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Broken")).toBeInTheDocument();
  });
});
