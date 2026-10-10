// Whether the main way of pointing is a finger, which has no hover and opens a keyboard whenever a text box gets focus.
export const isTouchScreen = () =>
  typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
