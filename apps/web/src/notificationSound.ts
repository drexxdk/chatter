import { loadNotificationSound } from "./preferences";
import type { NotificationSoundPreferences } from "./preferences";
import {
  NOTIFICATION_KINDS,
  notificationChannel,
  type NotificationKind,
} from "../../../shared/notificationPreferences.mjs";

let context: AudioContext | null = null;
let accountPreferences: NotificationSoundPreferences | undefined;
export function setAccountNotificationSound(
  value?: NotificationSoundPreferences,
): void {
  accountPreferences = value;
}
const currentPreferences = () => accountPreferences ?? loadNotificationSound();
const NOTES = {
  chime: [
    [740, 0],
    [988, 0.1],
  ],
  bell: [
    [1175, 0],
    [1568, 0.16],
  ],
  pulse: [
    [440, 0],
    [440, 0.1],
    [660, 0.2],
  ],
  wood: [[330, 0]],
} as const;

export async function prepareNotificationSound(): Promise<void> {
  const preference = currentPreferences();
  if (
    !NOTIFICATION_KINDS.some(
      (kind) => notificationChannel(preference, kind).enabled,
    )
  )
    return;
  await prepareAudioContext();
}

async function prepareAudioContext(): Promise<void> {
  if (typeof AudioContext === "undefined") return;
  try {
    if (!context || context.state === "closed") context = new AudioContext();
    if (context.state === "suspended") await context.resume();
  } catch {
    return;
  }
}

export async function playNotificationSound({
  preview = false,
  kind = "private",
}: { preview?: boolean; kind?: NotificationKind } = {}): Promise<void> {
  const preference = currentPreferences();
  if (
    preference.volume === 0 ||
    (!preview && !notificationChannel(preference, kind).enabled)
  )
    return;
  await prepareAudioContext();
  const latest = currentPreferences();
  const volume = latest.volume;
  const channel = notificationChannel(latest, kind);
  if (volume === 0 || (!preview && !channel.enabled)) return;
  if (!context || context.state !== "running") return;

  try {
    for (const [frequency, offset] of NOTES[channel.sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      oscillator.type = channel.sound === "wood" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.16, start + 0.015);
      gain.gain.linearRampToValueAtTime(0, start + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    }
  } catch {
    return;
  }
}
