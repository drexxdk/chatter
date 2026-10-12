import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { Field } from "./Field";

describe("Button", () => {
  it("does not submit a form unless told to", async () => {
    const onSubmit = vi.fn((event: React.SubmitEvent) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
        <Button type="submit" variant="primary">
          Send
        </Button>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("takes its look from the variant and extra classes from the caller", () => {
    render(
      <>
        <Button variant="primary" className="shrink-0">
          Go
        </Button>
        <Button variant="ghost">Cancel</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
      "bg-indigo-600",
      "shrink-0",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "hover:bg-neutral-800",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveClass(
      "bg-indigo-600",
    );
  });
});

describe("Field", () => {
  it("labels the box and describes it by its hint", () => {
    render(<Field id="nick" label="Nickname" hint="2 to 24 letters" />);

    const box = screen.getByLabelText("Nickname");

    expect(box).toHaveAccessibleDescription("2 to 24 letters");
    expect(box).toHaveAttribute("aria-describedby", "nick-hint");
  });

  it("turns the hint red and marks the box invalid", () => {
    render(<Field id="nick" label="Nickname" hint="Needed" invalid />);

    expect(screen.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Needed")).toHaveClass("text-red-300");
  });

  it("has nothing to describe the box by without a hint", () => {
    render(<Field id="mail" label="Email" type="email" />);

    expect(screen.getByLabelText("Email")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("can be a short box", () => {
    render(<Field id="age" label="Age" width="short" />);

    expect(screen.getByLabelText("Age")).toHaveClass("w-16");
    expect(screen.getByLabelText("Age")).not.toHaveClass("w-full");
  });
});
