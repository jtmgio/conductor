type SoundType = "checkin" | "overtime" | "meeting" | "transition" | "bell";

const STORAGE_KEY = "conductor-sounds-enabled";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, volume: number = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);

  // Soft envelope: quick attack, gentle decay
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Note frequencies
const C5 = 523.25;
const E5 = 659.25;
const G4 = 392.0;
const C6 = 1046.5;
const E6 = 1318.5;

const SOUNDS: Record<SoundType, (ctx: AudioContext) => void> = {
  // Two-note ascending chime (C5 → E5)
  checkin: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, C5, t, 0.25, 0.12);
    playTone(ctx, E5, t + 0.15, 0.3, 0.15);
  },

  // Single low tone (G4)
  overtime: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, G4, t, 0.35, 0.1);
  },

  // Three-note descending chime (E5 → C5 → G4)
  meeting: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, E5, t, 0.2, 0.12);
    playTone(ctx, C5, t + 0.18, 0.2, 0.12);
    playTone(ctx, G4, t + 0.36, 0.3, 0.1);
  },

  // Single bright ping (C6)
  transition: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, C6, t, 0.2, 0.08);
  },

  // Insistent triple bell — deliberately hard to miss (timer completions).
  // Each strike is C6 + E6 layered for a bell-like shimmer, louder than the chimes.
  bell: (ctx) => {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const strike = t + i * 0.45;
      playTone(ctx, C6, strike, 0.4, 0.25);
      playTone(ctx, E6, strike + 0.02, 0.35, 0.14);
    }
  },
};

export function playSound(type: SoundType): void {
  if (typeof window === "undefined") return;

  // Check preference
  const enabled = localStorage.getItem(STORAGE_KEY);
  if (enabled === "false") return;

  const ctx = getAudioContext();
  if (!ctx) return;

  SOUNDS[type](ctx);
}

export function isSoundsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
