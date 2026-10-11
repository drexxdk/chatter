import { render, screen } from "@testing-library/react";
import { Ban } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Notice } from "./Notice";

describe("Notice", () => {
  it("is amber unless told otherwise", () => {
    render(<Notice role="status">Careful</Notice>);

    expect(screen.getByRole("status")).toHaveClass(
      "rounded-md",
      "border-amber-500/40",
      "bg-amber-500/10",
      "text-amber-200",
    );
  });

  it("has a tone for errors and one for plain facts", () => {
    render(
      <>
        <Notice role="alert" tone="error">
          Broken
        </Notice>
        <Notice role="status" tone="neutral">
          Fine
        </Notice>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveClass("border-red-500/40");
    expect(screen.getByRole("status")).toHaveClass("border-neutral-600");
  });

  it("puts an icon before the text, hidden from screen readers", () => {
    const { container } = render(
      <Notice role="status" icon={Ban}>
        Blocked
      </Notice>,
    );

    expect(screen.getByRole("status")).toHaveClass("flex", "items-center");
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("takes extra classes and attributes from the caller", () => {
    render(
      <Notice className="justify-between" data-testid="mine">
        Hi
      </Notice>,
    );

    expect(screen.getByTestId("mine")).toHaveClass(
      "justify-between",
      "border-amber-500/40",
    );
    expect(screen.getByTestId("mine")).not.toHaveAttribute("role");
  });
});
