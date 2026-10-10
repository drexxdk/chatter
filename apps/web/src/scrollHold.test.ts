import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { holdScrollWhilePopups } from "./scrollHold";

const page = document.documentElement;
let height = 2000;

// jsdom has no layout, so the page's size is set by hand.
Object.defineProperty(page, "scrollHeight", { get: () => height });
Object.defineProperty(page, "clientHeight", { get: () => 500 });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function scrollTo(top: number) {
  page.scrollTop = top;
  window.dispatchEvent(new Event("scroll"));
  await settle();
}

async function openDialog(lock = true) {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.appendChild(dialog);
  if (lock) page.style.overflow = "hidden";
  await settle();

  return dialog;
}

async function closeDialog(dialog: HTMLElement) {
  dialog.remove();
  page.style.overflow = "";
  await settle();
}

beforeAll(() => holdScrollWhilePopups());

beforeEach(async () => {
  document.body.innerHTML = "";
  page.style.overflow = "";
  height = 2000;
  await settle();
  await scrollTo(0);
});

describe("the page's scroll position around a dialog", () => {
  it("is held while the page is locked, whatever moves it", async () => {
    await scrollTo(600);
    await openDialog();

    await scrollTo(1500);

    expect(page.scrollTop).toBe(600);
  });

  it("is put back when the dialog goes and the page was clamped meanwhile", async () => {
    await scrollTo(600);
    const dialog = await openDialog();

    page.scrollTop = 300;
    await closeDialog(dialog);

    expect(page.scrollTop).toBe(600);
  });

  it("is put back at the end of the page if that is where it was, however long the page is by then", async () => {
    await scrollTo(1500);
    const dialog = await openDialog();

    height = 2200;
    page.scrollTop = 1400;
    await closeDialog(dialog);

    expect(page.scrollTop).toBe(1700);
  });

  it("is not touched by a popup that did not lock the page", async () => {
    await scrollTo(600);
    const dialog = await openDialog(false);

    await scrollTo(900);
    await closeDialog(dialog);

    expect(page.scrollTop).toBe(900);
  });

  it("can be scrolled as usual when there is no popup", async () => {
    await scrollTo(600);
    await scrollTo(100);

    expect(page.scrollTop).toBe(100);
  });

  it("is not restored over the guest's own scrolling once the dialog has gone", async () => {
    await scrollTo(600);
    const dialog = await openDialog();
    page.scrollTop = 300;
    dialog.remove();
    page.style.overflow = "";

    window.dispatchEvent(new Event("wheel"));
    page.scrollTop = 250;
    await settle();

    expect(page.scrollTop).toBe(250);
  });
});
