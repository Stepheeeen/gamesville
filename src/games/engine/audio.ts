'use client';

/**
 * Synthesized fairground sound effects — zero asset downloads, everything
 * built from oscillators and filtered noise at play time. The context
 * unlocks on the first user gesture (standard mobile autoplay policy).
 */

export type SfxName =
  | 'tick'     // UI select / countdown pip
  | 'pop'      // balloon pop / block placed
  | 'ding'     // score! carnival bell ding
  | 'whoosh'   // throw / swipe
  | 'miss'     // low descending blip
  | 'buzzer'   // run over / wrong move
  | 'bell'     // round start ring-up
  | 'cheer'    // midway crowd swell
  | 'fanfare'  // win jingle
  | 'record';  // new personal best — prize fanfare

let ctx: AudioContext | null = null;
let unlocked = false;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call once from any pointerdown; resumes a suspended context. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
  unlocked = true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
}

export function setMuted(value: boolean) { muted = value; }
export function isMuted() { return muted; }

function tone(
  c: AudioContext,
  {
    freq,
    endFreq,
    type = 'sine',
    duration = 0.15,
    volume = 0.25,
    delay = 0,
  }: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    duration?: number;
    volume?: number;
    delay?: number;
  },
) {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(
  c: AudioContext,
  { duration = 0.2, volume = 0.2, freq = 1200, delay = 0 }:
  { duration?: number; volume?: number; freq?: number; delay?: number },
) {
  const t0 = c.currentTime + delay;
  const len = Math.ceil(c.sampleRate * duration);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

const RECIPES: Record<SfxName, (c: AudioContext) => void> = {
  tick:    c => tone(c, { freq: 660, type: 'square', duration: 0.05, volume: 0.08 }),
  pop:     c => { tone(c, { freq: 1600, endFreq: 700, type: 'triangle', duration: 0.05, volume: 0.28 }); noise(c, { duration: 0.04, volume: 0.2, freq: 3000 }); },
  ding:    c => { tone(c, { freq: 880, duration: 0.14, volume: 0.22 }); tone(c, { freq: 1320, duration: 0.22, volume: 0.14, delay: 0.06 }); },
  whoosh:  c => noise(c, { duration: 0.18, volume: 0.12, freq: 2600 }),
  miss:    c => tone(c, { freq: 240, endFreq: 110, type: 'sawtooth', duration: 0.22, volume: 0.12 }),
  buzzer:  c => { tone(c, { freq: 190, type: 'sawtooth', duration: 0.45, volume: 0.16 }); tone(c, { freq: 95, type: 'square', duration: 0.45, volume: 0.1 }); },
  bell:    c => { tone(c, { freq: 1180, duration: 0.7, volume: 0.2 }); tone(c, { freq: 1770, duration: 0.5, volume: 0.08 }); },
  cheer:   c => { noise(c, { duration: 0.9, volume: 0.14, freq: 2000 }); noise(c, { duration: 0.5, volume: 0.1, freq: 3500, delay: 0.15 }); },
  fanfare: c => { [392, 523, 659, 784].forEach((f, i) => tone(c, { freq: f, duration: 0.15, volume: 0.18, delay: i * 0.09 })); },
  record:  c => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, { freq: f, duration: 0.16, volume: 0.2, delay: i * 0.1 })); },
};

export function sfx(name: SfxName) {
  const c = getCtx();
  if (!c || !unlocked || muted) return;
  if (c.state === 'suspended') c.resume();
  try { RECIPES[name](c); } catch { /* audio is never worth crashing for */ }
}
