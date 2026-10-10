import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { neighbour, useGridNavigation } from "./gridNavigation";

function cell(x: number, y: number, w = 40, h = 40) {
  const button = document.createElement("button");
  button.getBoundingClientRect = () =>
    ({
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
    }) as DOMRect;
  return button;
}

describe("neighbour", () => {
  // 3 columns, 2 rows, the second row not full.
  const grid = [
    cell(0, 0),
    cell(40, 0),
    cell(80, 0),
    cell(0, 40),
    cell(40, 40),
  ];

  it.each([
    ["ArrowRight", 0, 1],
    ["ArrowLeft", 1, 0],
    ["ArrowDown", 1, 4],
    ["ArrowUp", 4, 1],
    ["ArrowDown", 0, 3],
  ])("%s from item %i goes to item %i", (key, from, to) => {
    expect(neighbour(grid, grid[from]!, key)).toBe(grid[to]);
  });

  it("goes to the nearest below when the column is short, and not past the ends", () => {
    expect(neighbour(grid, grid[2]!, "ArrowDown")).toBe(grid[4]);
    expect(neighbour(grid, grid[0]!, "ArrowUp")).toBeUndefined();
    expect(neighbour(grid, grid[3]!, "ArrowDown")).toBeUndefined();
  });

  it("continues from the end of a row to the start of the next, and back", () => {
    expect(neighbour(grid, grid[2]!, "ArrowRight")).toBe(grid[3]);
    expect(neighbour(grid, grid[3]!, "ArrowLeft")).toBe(grid[2]);
    expect(neighbour(grid, grid[4]!, "ArrowRight")).toBeUndefined();
  });

  it("goes to the first and the last with Home and End", () => {
    expect(neighbour(grid, grid[2]!, "Home")).toBe(grid[0]);
    expect(neighbour(grid, grid[2]!, "End")).toBe(grid[4]);
  });

  it("stays in its column among pictures of different heights, and crosses over sideways", () => {
    // Written column by column, as columns of pictures are.
    const left = [cell(0, 0, 100, 150), cell(0, 160, 100, 90)];
    const right = [cell(110, 0, 100, 70), cell(110, 80, 100, 200)];
    const all = [...left, ...right];

    expect(neighbour(all, left[0]!, "ArrowDown")).toBe(left[1]);
    expect(neighbour(all, right[0]!, "ArrowDown")).toBe(right[1]);
    expect(neighbour(all, left[0]!, "ArrowRight")).toBe(right[0]);
    expect(neighbour(all, right[1]!, "ArrowLeft")).toBe(left[1]);
  });
});

function Grid({ onLeaveUp }: { onLeaveUp?: () => void }) {
  const keys = useGridNavigation({ onLeaveUp });

  return (
    <div ref={keys.ref} onFocus={keys.onFocus} onKeyDown={keys.onKeyDown}>
      {["a", "b", "c"].map((name) => (
        <button key={name} type="button" data-grid-item>
          {name}
        </button>
      ))}
    </div>
  );
}

describe("useGridNavigation", () => {
  it("is one tab stop, where focus was last", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <Grid />
        <button type="button">after</button>
      </>,
    );
    const stops = () =>
      ["a", "b", "c"].filter(
        (name) => screen.getByText(name).getAttribute("tabindex") === "0",
      );

    expect(stops()).toEqual(["a"]);

    await user.click(screen.getByText("b"));
    expect(stops()).toEqual(["b"]);

    screen.getByText("before").focus();
    await user.tab();
    expect(screen.getByText("b")).toHaveFocus();

    await user.tab();
    expect(screen.getByText("after")).toHaveFocus();
  });

  it("moves with the arrow keys, Home and End, and leaves upwards from the top", async () => {
    const user = userEvent.setup();
    const leave = vi.fn();
    render(<Grid onLeaveUp={leave} />);
    screen.getByText("a").focus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByText("c")).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByText("a")).toHaveFocus();

    await user.keyboard("{End}");
    expect(screen.getByText("c")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("b")).toHaveFocus();

    expect(leave).not.toHaveBeenCalled();
    await user.keyboard("{ArrowUp}");
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
