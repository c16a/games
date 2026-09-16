const SOUND_ENABLED_KEY = "happy-arcade:sounds-enabled";

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSoundsEnabled(storage: PreferenceStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(SOUND_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveSoundsEnabled(enabled: boolean, storage: PreferenceStorage | null = browserStorage()): void {
  try {
    storage?.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch {
    // Sound preferences are optional when storage is unavailable.
  }
}

export class ArcadeSounds {
  enabled: boolean;
  private context: AudioContext | null = null;

  constructor(enabled = loadSoundsEnabled()) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    saveSoundsEnabled(enabled);
    if (!enabled && this.context?.state === "running") void this.context.suspend().catch(() => undefined);
  }

  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  playCoinScore(): void {
    const context = this.context;
    if (!this.enabled || !context || context.state !== "running") return;

    try {
      const start = context.currentTime;
      for (const [index, frequency] of [659.25, 987.77].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = start + index * 0.055;
        const noteEnd = noteStart + 0.13;

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.addEventListener("ended", () => {
          oscillator.disconnect();
          gain.disconnect();
        }, { once: true });
        oscillator.start(noteStart);
        oscillator.stop(noteEnd);
      }
    } catch {
      // A sound effect should never interrupt gameplay.
    }
  }

  destroy(): void {
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}
