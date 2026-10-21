import { loadNotificationSound } from "./preferences";

let context: AudioContext | null = null;

export async function prepareNotificationSound(): Promise<void> {
  if (!loadNotificationSound().enabled || typeof AudioContext === "undefined")
    return;
  try {
    if (!context || context.state === "closed") context = new AudioContext();
    if (context.state === "suspended") await context.resume();
  } catch {
    return;
  }
}

export async function playNotificationSound(): Promise<void> {
  const preference = loadNotificationSound();
  if (!preference.enabled || preference.volume === 0) return;
  await prepareNotificationSound();
  const { enabled, volume } = loadNotificationSound();
  if (!enabled || volume === 0) return;
  if (!context || context.state !== "running") return;

  try {
    for (const [frequency, offset] of [
      [740, 0],
      [988, 0.1],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      oscillator.type = "sine";
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
