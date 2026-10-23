import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadNotificationSound, saveNotificationSound } from "./preferences";

class TestAudioContext {
  state = "running";
  currentTime = 1;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createOscillator = vi.fn(() => ({
    type: "sine",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }));
  createGain = vi.fn(() => ({
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
}

describe("notification chime", () => {
  let audio: TestAudioContext;
  beforeEach(() => {
    vi.resetModules();
    audio = new TestAudioContext();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          return audio;
        }
      },
    );
  });

  it("does not create sound until explicitly enabled", async () => {
    const { playNotificationSound } = await import("./notificationSound");
    await playNotificationSound();
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });

  it("plays two short notes at the selected volume", async () => {
    saveNotificationSound({ enabled: true, volume: 0.25 });
    const { playNotificationSound } = await import("./notificationSound");
    await playNotificationSound();
    expect(audio.createOscillator).toHaveBeenCalledTimes(2);
    expect(
      audio.createGain.mock.results[0].value.gain.linearRampToValueAtTime,
    ).toHaveBeenCalledWith(0.04, 1.015);
    expect(
      audio.createOscillator.mock.results[0].value.stop,
    ).toHaveBeenCalledWith(1.2);
  });

  it.each([0, 0.25])(
    "previews while disabled at volume %s without enabling notifications",
    async (volume) => {
      saveNotificationSound({ enabled: false, volume });
      const { playNotificationSound } = await import("./notificationSound");
      await playNotificationSound({ preview: true });
      expect(audio.createOscillator).toHaveBeenCalledTimes(
        volume === 0 ? 0 : 2,
      );
      if (volume)
        expect(
          audio.createGain.mock.results[0].value.gain.linearRampToValueAtTime,
        ).toHaveBeenCalledWith(volume * 0.16, 1.015);
      expect(loadNotificationSound()).toEqual({ enabled: false, volume });
    },
  );

  it.each(["warnings", "joins"] as const)(
    "plays enabled %s independently from private messages at the shared volume",
    async (kind) => {
      saveNotificationSound({
        enabled: false,
        volume: 0.25,
        [kind]: { enabled: true, sound: "wood" },
      });
      const { playNotificationSound } = await import("./notificationSound");
      await playNotificationSound();
      expect(audio.createOscillator).not.toHaveBeenCalled();
      await playNotificationSound({ kind });
      expect(audio.createOscillator).toHaveBeenCalledTimes(1);
      expect(audio.createOscillator.mock.results[0].value.type).toBe(
        "triangle",
      );
      expect(
        audio.createGain.mock.results[0].value.gain.linearRampToValueAtTime,
      ).toHaveBeenCalledWith(0.04, 1.015);
    },
  );

  it.each([
    ["chime", 740, 2],
    ["bell", 1175, 2],
    ["pulse", 440, 3],
    ["wood", 330, 1],
  ] as const)(
    "previews the selected %s sound",
    async (sound, frequency, count) => {
      saveNotificationSound({ enabled: false, volume: 0.5, sound });
      const { playNotificationSound } = await import("./notificationSound");
      await playNotificationSound({ preview: true });
      expect(audio.createOscillator).toHaveBeenCalledTimes(count);
      expect(
        audio.createOscillator.mock.results[0].value.frequency.setValueAtTime,
      ).toHaveBeenCalledWith(frequency, 1);
    },
  );

  it("unlocks suspended audio following a user interaction", async () => {
    saveNotificationSound({ enabled: true, volume: 0.5 });
    audio.state = "suspended";
    const { prepareNotificationSound } = await import("./notificationSound");
    await prepareNotificationSound();
    expect(audio.resume).toHaveBeenCalledTimes(1);
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });

  it("stops playing immediately when muted or disabled", async () => {
    const { playNotificationSound } = await import("./notificationSound");
    saveNotificationSound({ enabled: true, volume: 0 });
    await playNotificationSound();
    saveNotificationSound({ enabled: false, volume: 1 });
    await playNotificationSound();
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });

  it("does not fail when the browser cannot provide audio", async () => {
    saveNotificationSound({ enabled: true, volume: 0.5 });
    vi.stubGlobal("AudioContext", undefined);
    const { playNotificationSound } = await import("./notificationSound");
    await expect(playNotificationSound()).resolves.toBeUndefined();
  });

  it("does not play a pending sound after it has been disabled", async () => {
    saveNotificationSound({ enabled: true, volume: 0.5 });
    audio.state = "suspended";
    let unlock!: () => void;
    audio.resume.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          unlock = () => {
            audio.state = "running";
            resolve();
          };
        }),
    );
    const { playNotificationSound } = await import("./notificationSound");
    const playing = playNotificationSound();
    saveNotificationSound({ enabled: false, volume: 0.5 });
    unlock();
    await playing;
    expect(audio.createOscillator).not.toHaveBeenCalled();
  });
});
