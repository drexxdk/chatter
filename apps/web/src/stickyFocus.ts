// Browsers scroll the page to where a focused element sits in the layout, not to where its sticky box is stuck, so
// handing focus back to a button in the sticky header or footer (as a dropdown or dialog does when it closes) throws
// the page to the top. A sticky box is always in view, so focusing inside one never needs to scroll.
export function keepStickyInView() {
  const focus = HTMLElement.prototype.focus;

  HTMLElement.prototype.focus = function (this: HTMLElement, options) {
    return focus.call(
      this,
      options?.preventScroll === undefined && insideSticky(this)
        ? { ...options, preventScroll: true }
        : options,
    );
  };
}

function insideSticky(element: HTMLElement) {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).position === "sticky") return true;
  }

  return false;
}
