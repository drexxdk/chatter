// A GIF is sent as an ordinary message whose whole text is the address of the picture, so the server, the history, slow
// mode, bans and private conversations all treat it like any other message. Only pictures from GIPHY's own hosts, in
// this exact shape, are drawn as pictures; anything else stays text.
const GIF_URL =
  /^https:\/\/(?:media\d*|i)\.giphy\.com\/media\/[\w.=~-]+(?:\/[\w.=~-]+)*\.gif$/;

// The picture a message shows, or null when it is just text.
export function gifOf(text: string): string | null {
  const trimmed = text.trim();

  return GIF_URL.test(trimmed) ? trimmed : null;
}

// GIPHY's addresses carry tracking in the query; the picture is the same without it, and shorter to send.
export function sendableGifUrl(address: string): string | null {
  const bare = address.split(/[?#]/)[0];

  return GIF_URL.test(bare) ? bare : null;
}
