// M7: procedural SFX (Web Audio) + TTS.
//
// SFX are synthesized in code (no audio files). Death quips are spoken
// with pre-generated WAV clips in the cloned "bobthefrog" voice
// (assets/audio/quip-*.wav); speechSynthesis is only the fallback.
// The pure-logic parts (mute state, event mapping, quip selection,
// quip->clip mapping) are importable and testable under Node; browser
// APIs are guarded so the module loads (and no-ops) outside a browser.

// SFX names.
export const SFX = Object.freeze({
  HOP: 'hop',
  DROWN: 'drown',
  CRASH: 'crash',
  WIN: 'win',
  TICK: 'tick',
});

// Game event -> SFX name. (M5's vehicle collision will map to CRASH.)
export const EVENT_SFX = Object.freeze({
  hop: SFX.HOP,
  drown: SFX.DROWN,
  crash: SFX.CRASH,
  win: SFX.WIN,
  levelup: SFX.TICK,
});

// Mild swears / quips, spoken when Bob dies. Deliberately mild.
export const QUIPS = Object.freeze([
  'Damn.',
  'Well, that hurt.',
  'Crap.',
  'Ouch.',
  'Blast it.',
]);

// --- mute state (pure, testable) ---

let muted = false; // default: sound ON

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = !!m;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

// Random quip; `rng` is injectable for deterministic tests.
export function pickQuip(rng = Math.random) {
  return QUIPS[Math.floor(rng() * QUIPS.length)];
}

// Quip text -> pre-generated WAV clip (bobthefrog voice, M7.1).
// Every quip has a clip; unmapped text maps to null (fallback path).
export const QUIP_CLIPS = Object.freeze({
  'Damn.': 'assets/audio/quip-damn.wav',
  'Well, that hurt.': 'assets/audio/quip-well-that-hurt.wav',
  'Crap.': 'assets/audio/quip-crap.wav',
  'Ouch.': 'assets/audio/quip-ouch.wav',
  'Blast it.': 'assets/audio/quip-blast-it.wav',
});

// Pure mapping: quip text -> clip file (null when unmapped).
export function quipClip(text) {
  return QUIP_CLIPS[text] ?? null;
}

// --- Web Audio synthesis (browser-only; silent no-op elsewhere) ---

let ctx = null;

function audioCtx() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!ctx) ctx = new window.AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// Short sine/triangle/square blip with an optional pitch slide.
function tone(c, freq, dur, { type = 'sine', to = null, gain = 0.15 } = {}) {
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

// Short burst of filtered-ish white noise (decaying envelope).
function noise(c, dur, gain = 0.15) {
  const len = Math.max(1, Math.ceil(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.start();
}

// Synthesize each SFX. Kept short (<= ~0.4s) and distinct.
function synthesize(c, name) {
  switch (name) {
    case SFX.HOP:
      // quick rising blip
      tone(c, 320, 0.08, { type: 'triangle', to: 520, gain: 0.12 });
      break;
    case SFX.DROWN:
      // sinking sweep + a little splash noise
      tone(c, 220, 0.35, { type: 'sine', to: 70, gain: 0.18 });
      noise(c, 0.2, 0.08);
      break;
    case SFX.CRASH:
      // squish: noise burst + low thud
      noise(c, 0.18, 0.2);
      tone(c, 90, 0.12, { type: 'square', gain: 0.12 });
      break;
    case SFX.WIN:
      // short jingle: C5 E5 G5 C6
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const step = 0.09;
      for (let i = 0; i < notes.length; i++) {
        const t = c.currentTime + i * step;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i], t);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step);
        osc.connect(g).connect(c.destination);
        osc.start(t);
        osc.stop(t + step);
      }
      break;
    case SFX.TICK:
      // level-up tick: short high blip
      tone(c, 880, 0.05, { type: 'square', gain: 0.08 });
      break;
    default:
      return;
  }
}

/**
 * Play a procedural SFX by name (one of SFX). No-op when muted or when
 * the Web Audio API is unavailable (e.g. under Node).
 */
export function sfx(name) {
  if (muted) return;
  const c = audioCtx();
  if (!c) return;
  synthesize(c, name);
}

// --- TTS (browser-only; silent no-op elsewhere) ---

/**
 * Speak a line via the Web Speech API. No-op when speechSynthesis is
 * unavailable or audio is muted.
 */
export function speak(text) {
  if (muted) return;
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

// --- Quip clip playback (browser-only; silent no-op elsewhere) ---

const clipCache = new Map(); // url -> Promise<AudioBuffer>

function loadClip(url) {
  if (!clipCache.has(url)) {
    clipCache.set(
      url,
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        const c = audioCtx();
        if (!c) throw new Error('no AudioContext');
        return c.decodeAudioData(bytes);
      })()
    );
  }
  return clipCache.get(url);
}

/**
 * Bob's death quip: a mild, random swear/quip. Played from the
 * pre-generated bobthefrog WAV clip when available; falls back to
 * speechSynthesis when the clip is missing/unloadable or Web Audio is
 * unavailable. No-op when muted (or outside a browser).
 */
export function quip() {
  const text = pickQuip();
  if (muted) return;
  const clip = quipClip(text);
  const c = audioCtx();
  if (!clip || !c) {
    speak(text);
    return;
  }
  loadClip(clip)
    .then((buf) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start();
    })
    .catch(() => {
      // Clip missing/unreadable: fall back to speechSynthesis.
      speak(text);
    });
}