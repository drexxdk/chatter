export const NOTIFICATION_SOUNDS = ["chime", "bell", "pulse", "wood"];
export const NOTIFICATION_KINDS = ["private", "warnings", "joins"];

export function parseNotificationPreferences(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.volume !== "number" ||
    !Number.isFinite(value.volume)
  )
    return undefined;
  const result = {
    enabled: value.enabled,
    volume: Math.max(0, Math.min(1, value.volume)),
  };
  if (value.sound !== undefined) {
    if (!NOTIFICATION_SOUNDS.includes(value.sound)) return undefined;
    result.sound = value.sound;
  }
  for (const kind of ["warnings", "joins"]) {
    const channel = value[kind];
    if (channel === undefined) continue;
    if (
      !channel ||
      typeof channel !== "object" ||
      typeof channel.enabled !== "boolean" ||
      !NOTIFICATION_SOUNDS.includes(channel.sound)
    )
      return undefined;
    result[kind] = { enabled: channel.enabled, sound: channel.sound };
  }
  return result;
}

export function notificationChannel(preferences, kind) {
  if (kind === "private")
    return {
      enabled: preferences.enabled,
      sound: preferences.sound ?? "chime",
    };
  return (
    preferences[kind] ?? {
      enabled: false,
      sound: kind === "warnings" ? "pulse" : "wood",
    }
  );
}
