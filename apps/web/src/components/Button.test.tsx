import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, ButtonLink } from "./Button";
import { Field } from "./Field";

describe("Button", () => {
  it.each(["primary", "secondary", "danger", "ghost"] as const)(
    "uses compact body text for %s actions",
    (variant) => {
      render(
        <>
          <Button variant={variant}>Action</Button>
          <ButtonLink variant={variant} href="/">
            Destination
          </ButtonLink>
        </>,
      );
      expect(screen.getByRole("button", { name: "Action" })).toHaveClass(
        "text-sm",
      );
      expect(screen.getByRole("link", { name: "Destination" })).toHaveClass(
        "text-sm",
      );
    },
  );

  it("uses a muted red fill for destructive actions", () => {
    render(<Button variant="danger">Delete</Button>);
    const action = screen.getByRole("button", { name: "Delete" });
    expect(action).toHaveClass(
      "rounded-md",
      "bg-red-900/80",
      "px-3",
      "py-1.5",
      "text-red-100",
      "ring-red-400/30",
      "hover:bg-red-800/80",
    );
    expect(action).not.toHaveClass("bg-red-600", "hover:bg-red-500");
  });

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
  it("reveals and hides a password without changing it or submitting", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
      </form>,
    );
    const box = screen.getByLabelText("Password");
    await user.type(box, "sample-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(box).toHaveAttribute("type", "text");
    expect(box).toHaveAttribute("autocomplete", "new-password");
    expect(box).toHaveValue("sample-password");
    expect(box).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Tab}{Enter}");
    expect(box).toHaveAttribute("type", "password");
    expect(box).toHaveValue("sample-password");
    expect(submit).not.toHaveBeenCalled();
  });

  it("disables password reveal with the field and omits it from other fields", () => {
    render(
      <>
        <Field id="password" label="Password" type="password" disabled />
        <Field id="email" label="Email" type="email" />
      </>,
    );
    expect(
      screen.getAllByRole("button", { name: "Show password" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toBeDisabled();
  });

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
