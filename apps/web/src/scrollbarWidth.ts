// The width of the page's scrollbar, as a CSS variable, so that the page can be given the same padding by a rule in
// index.css as a dialog gives it by hand. Measured on a box that always scrolls; 0 where scrollbars float over the page.
export function publishScrollbarWidth() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:-100px;width:100px;height:100px;overflow:scroll;visibility:hidden";
  document.body.appendChild(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();

  document.documentElement.style.setProperty("--scrollbar-width", `${width}px`);
}
