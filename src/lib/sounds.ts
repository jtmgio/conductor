type SoundType = "checkin" | "overtime" | "meeting" | "meetingImminent" | "meetingNow" | "transition";

const STORAGE_KEY = "conductor-sounds-enabled";
const VOLUME_KEY = "conductor-sounds-volume"; // 0..1 multiplier, default 1

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

function getVolumeScale(): number {
  if (typeof window === "undefined") return 1;
  const raw = localStorage.getItem(VOLUME_KEY);
  const n = raw === null ? 1 : parseFloat(raw);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 1;
}

/**
 * `wave` matters more than volume for cutting through noise: a sine has no
 * harmonics and is the first thing to disappear under speech or music, so the
 * meeting alerts use triangle. Everything ambient stays sine.
 */
function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.15,
  wave: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, startTime);

  // Soft envelope: quick attack, gentle decay
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume * getVolumeScale(), startTime + 0.02);
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
const G5 = 783.99;
const C6 = 1046.5;

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

  // Meetings escalate in three stages. All ascending — a descending chime reads
  // as "done" and is the wrong shape for something with a deadline attached —
  // and all doubled, because repetition survives a noisy moment better than
  // volume does.
  //
  // Stage 1 (lead time, ~5 min): soft rise, twice. Noticeable, not alarming.
  meeting: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, C5, t, 0.18, 0.16, "triangle");
    playTone(ctx, E5, t + 0.16, 0.22, 0.18, "triangle");
    playTone(ctx, C5, t + 0.5, 0.18, 0.16, "triangle");
    playTone(ctx, E5, t + 0.66, 0.26, 0.18, "triangle");
  },

  // Stage 2 (1 min): higher, tighter, three rises. Unmistakably "now-ish".
  meetingImminent: (ctx) => {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.34;
      playTone(ctx, E5, at, 0.14, 0.2, "triangle");
      playTone(ctx, G5, at + 0.13, 0.18, 0.22, "triangle");
    }
  },

  // Stage 3 (starting now): insistent. Three passes of a fast ascending
  // arpeggio over ~2.5s, each pass octave-doubled underneath for body, ending
  // on a held top note.
  //
  // Deliberately annoying, but via duration and repetition rather than timbre —
  // a square or saw wave here would be genuinely painful in a headset, and the
  // point is to be impossible to ignore, not unpleasant to hear.
  meetingNow: (ctx) => {
    const t = ctx.currentTime;
    for (let pass = 0; pass < 3; pass++) {
      const at = t + pass * 0.78;
      playTone(ctx, C5, at, 0.12, 0.26, "triangle");
      playTone(ctx, E5, at + 0.12, 0.12, 0.27, "triangle");
      playTone(ctx, G5, at + 0.24, 0.12, 0.28, "triangle");
      playTone(ctx, C6, at + 0.36, pass === 2 ? 0.6 : 0.3, 0.3, "triangle");
      // Octave below, quieter — adds weight so it reads through speech.
      playTone(ctx, C5 / 2, at, 0.5, 0.12, "triangle");
    }
  },

  // Single bright ping (C6)
  transition: (ctx) => {
    const t = ctx.currentTime;
    playTone(ctx, C6, t, 0.2, 0.08);
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

export function getSoundVolume(): number {
  return getVolumeScale();
}

export function setSoundVolume(v: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOLUME_KEY, String(Math.min(Math.max(v, 0), 1)));
}

/** Preview a sound at the current volume — for the Settings slider. */
export function previewSound(type: SoundType = "meeting"): void {
  playSound(type);
}

export function isSoundsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
