// The width of the scrollbar the page keeps room for (its gutter), as a CSS variable: 0 where scrollbars float over the
// page. A dialog takes the gutter away with the page's scroll, and index.css gives the page that much padding in its
// place, so that nothing moves and the dialog's own scrollbar is where the page's was.
export function publishScrollbarWidth() {
  const root = document.documentElement;
  // A fixed box is as wide as the window is without a scrollbar.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:0;visibility:hidden;pointer-events:none";

  const update = () => {
    // With a dialog open there is no gutter to measure.
    if (document.querySelector('#headlessui-portal-root [role="dialog"]')) {
      return;
    }

    if (!probe.isConnected) document.body.append(probe);

    root.style.setProperty(
      "--scrollbar-width",
      `${Math.max(0, window.innerWidth - probe.offsetWidth)}px`,
    );
  };

  update();
  window.addEventListener("resize", update);
}
