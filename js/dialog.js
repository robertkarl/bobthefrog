// M5.6: pre-roll conversation — Jensen's dialog before level 1.
//
// Pure state machine (testable under Node) + browser audio playback.
//
// TTS: Jensen's lines are pre-generated WAV clips from the local voice-
// cloning setup (~/Code/local-voice — MLX Qwen3-TTS, registered "Jensen"
// voice; see assets/dialogs/level1.txt for the source script). In the
// browser we fetch + decode the clips with Web Audio. If a clip cannot be
// loaded (or Web Audio is unavailable), we fall back to the Web Speech
// API (speechSynthesis) so the lines are still spoken.

// Level-1 pre-roll lines (from assets/dialogs/level1.txt).
export const LEVEL1_LINES = [
  {
    speaker: 'Jensen',
    mood: 'smiling',
    text: 'Total revenue for the quarter was eighty billion dollars. The large shareholders expect more though.',
    audio: 'assets/audio/jensen-line1.wav',
  },
  {
    speaker: 'Jensen',
    mood: 'serious',
    text: "Help me crank those numbers up. Let's smuggle some more GPUs to China. Nobody will suspect a frog loading the plane.",
    audio: 'assets/audio/jensen-line2.wav',
  },
];

/**
 * Create a dialog state machine.
 *
 * Phases: 'idle' -> 'active' -> 'done'.
 *   begin()    starts at line 0 (fires onLine)
 *   advance()  next line (fires onLine), or done (fires onDone) after the last
 *   skip()     jumps straight to done (fires onDone)
 *
 * `callbacks`: { onLine(line), onDone() } — both optional.
 */
export function createDialog(lines, callbacks = {}) {
  let index = -1;
  let phase = 'idle';

  return {
    get phase() {
      return phase;
    },
    get index() {
      return index;
    },
    get current() {
      return index >= 0 && index < lines.length ? lines[index] : null;
    },
    get done() {
      return phase === 'done';
    },
    begin() {
      if (phase !== 'idle') return false;
      phase = 'active';
      index = 0;
      if (lines.length > 0) callbacks.onLine?.(lines[0]);
      return true;
    },
    advance() {
      if (phase !== 'active') return false;
      index++;
      if (index >= lines.length) {
        phase = 'done';
        callbacks.onDone?.();
      } else {
        callbacks.onLine?.(lines[index]);
      }
      return true;
    },
    skip() {
      if (phase === 'done') return false;
      phase = 'done';
      callbacks.onDone?.();
      return true;
    },
  };
}

// --- TTS playback (browser-only; no-op elsewhere) ---
// Primary: the pre-generated Jensen WAV clips (local-voice setup).
// Fallback: Web Speech API if a clip fails to load.

let ctx = null;
let activeLine = null; // the line currently being spoken
let source = null; // current AudioBufferSourceNode
const clipCache = new Map(); // url -> Promise<AudioBuffer>

function audioCtx() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!ctx) ctx = new window.AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

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
 * Speak a line via the Web Speech API (fallback voice).
 * `onDone` fires when the utterance finishes (or immediately if
 * speechSynthesis is unavailable).
 */
function speakFallback(text, onDone) {
  if (typeof speechSynthesis === 'undefined') {
    onDone?.();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 1;
  u.onend = () => onDone?.();
  speechSynthesis.speak(u);
}

/**
 * Speak a dialog line: play its pre-generated Jensen WAV clip via Web
 * Audio. If the clip cannot be loaded (or Web Audio is unavailable), fall
 * back to speechSynthesis. The returned Promise resolves when the line
 * finishes playing; if there is no audio capability at all it never
 * resolves (the dialog then waits for a keypress).
 */
export function playLineAudio(line) {
  let resolveFinish;
  const finishPromise = new Promise((r) => (resolveFinish = r));

  activeLine = line;
  const finish = () => {
    if (activeLine === line) activeLine = null;
    resolveFinish();
  };

  const c = audioCtx();
  if (!c || !line.audio) {
    // No Web Audio (or no clip): fall back to speechSynthesis.
    speakFallback(line.text, finish);
    return finishPromise;
  }

  loadClip(line.audio)
    .then((buf) => {
      if (activeLine !== line) return; // superseded by a newer line
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.onended = finish;
      src.start();
      source = src;
    })
    .catch(() => {
      // Clip missing/unreadable: fall back to speechSynthesis.
      if (activeLine === line) speakFallback(line.text, finish);
    });

  return finishPromise;
}

/** Stop the currently spoken line (e.g. when the player advances early). */
export function stopLineAudio() {
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source = null;
  }
  activeLine = null;
}