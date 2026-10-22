import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PopoverButton, PopoverPanel } from "@headlessui/react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { ReloadUiContext, useReloadUi } from "./reloadUi";
import { ReloadPopover } from "./components/ReloadMenu";

function PickerPage() {
  const ui = useReloadUi();
  const location = useLocation();
  return (
    <ReloadUiContext value={{ ...ui, ready: true }}>
      <output aria-label="Address">{location.search}</output>
      <ReloadPopover name="attachments">
        <PopoverButton>Attachments</PopoverButton>
        <PopoverPanel>
          <output aria-label="Picker tab">{ui.picker ?? "none"}</output>
        </PopoverPanel>
      </ReloadPopover>
    </ReloadUiContext>
  );
}

function Page() {
  const ui = useReloadUi();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Address">
        {location.pathname}
        {location.search}
      </output>
      <output aria-label="Dialog">{ui.dialog ?? "closed"}</output>
      <button onClick={() => ui.setDialog("profile")}>Profile</button>
      <button onClick={() => navigate("/about")}>About</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <button
        onClick={() => {
          ui.setMenu("rooms");
          ui.closeMenu("admin");
        }}
      >
        Switch menus
      </button>
    </>
  );
}

describe("reload UI state", () => {
  it("does not let a closing menu clear a newly opened menu", async () => {
    render(
      <MemoryRouter initialEntries={["/?menu=admin"]}>
        <Page />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Switch menus"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(
        "/?menu=rooms",
      ),
    );
  });

  it("preserves the restored picker tab through Strict Mode effect replay", async () => {
    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={["/rooms/general?menu=attachments&picker=youtube"]}
        >
          <PickerPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Picker tab")).toHaveTextContent("youtube"),
    );
    expect(screen.getByLabelText("Address")).toHaveTextContent(
      "?menu=attachments&picker=youtube",
    );
    fireEvent.click(screen.getByText("Attachments"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toBeEmptyDOMElement(),
    );
  });

  it("restores allowed flags on first load and cleans invalid values", async () => {
    render(
      <MemoryRouter initialEntries={["/?dialog=profile&menu=unknown&keep=yes"]}>
        <Page />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Dialog")).toHaveTextContent("profile");
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(
        "/?keep=yes&dialog=profile",
      ),
    );
  });

  it("replaces UI changes and does not replay them on Back or Forward", async () => {
    render(
      <MemoryRouter initialEntries={["/", "/rooms/general?dialog=sound"]}>
        <Page />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Profile"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(
        "/rooms/general?dialog=profile",
      ),
    );
    fireEvent.click(screen.getByText("About"));
    await waitFor(() =>
      expect(screen.getByLabelText("Dialog")).toHaveTextContent("closed"),
    );
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(
        /^\/rooms\/general$/,
      ),
    );
    expect(screen.getByLabelText("Dialog")).toHaveTextContent("closed");
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(/^\/$/),
    );
    fireEvent.click(screen.getByText("Forward"));
    await waitFor(() =>
      expect(screen.getByLabelText("Address")).toHaveTextContent(
        /^\/rooms\/general$/,
      ),
    );
    expect(screen.getByLabelText("Dialog")).toHaveTextContent("closed");
  });
});
