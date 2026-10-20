export function youtubeUrl(address: string): string | null {
  try {
    const value = address.trim();
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;

    const host = url.hostname;
    let id: string | null = null;
    if (host === "youtu.be") {
      const match = /^\/([\w-]{11})\/?$/.exec(url.pathname);
      id = match?.[1] ?? null;
    } else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else
        id =
          /^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ??
          null;
    } else if (
      ["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)
    ) {
      id = /^\/embed\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id)
      ? `https://www.youtube.com/watch?v=${id}`
      : null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(address: string): string | null {
  const canonical = youtubeUrl(address);
  if (!canonical) return null;
  const id = new URL(canonical).searchParams.get("v");
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
