// The width of the page's scrollbar right now (0 when the page is too short to scroll, or scrollbars float over it), as
// a CSS variable, so that the page can be given the same padding by a rule in index.css as a dialog gives it by hand.
// It follows the page as it grows and shrinks; while a dialog hides the scrollbar there is nothing to measure.
export function publishScrollbarWidth() {
  const root = document.documentElement;
  const update = () => {
    if (document.querySelector('#headlessui-portal-root [role="dialog"]')) {
      return;
    }

    // A page that cannot be measured (no layout) has no scrollbar to make room for.
    const width = root.clientWidth
      ? Math.max(0, window.innerWidth - root.clientWidth)
      : 0;

    root.style.setProperty("--scrollbar-width", `${width}px`);
  };

  update();
  window.addEventListener("resize", update);
  new ResizeObserver(update).observe(document.body);
}
