// Entry point: boot, requestAnimationFrame loop, state machine wiring.

import { GRID_COLS, GRID_ROWS, BASE_CELL_PX, DT_CLAMP_S } from './config.js';
import { STATE, EVENT, nextState } from './state.js';
import {
  drawGrid,
  drawLayout,
  drawPlayer,
  drawTraffic,
  drawTitleOverlay,
  drawGameOverOverlay,
  drawWinOverlay,
} from './render.js';
import { generateLevel } from './levelgen/index.js';
import { attachStartHandler, attachHopHandler } from './input.js';
import { createPlayer, hop } from './player.js';
import { createTraffic, updateTraffic, bobInDanger } from './vehicles.js';
import { sfx, quip, toggleMute, isMuted } from './audio.js';
import { LEVEL1_LINES, createDialog, playLineAudio, stopLineAudio } from './dialog.js';
import { drawDialog } from './dialog-draw.js';

// --- state ---
let gameState = STATE.TITLE;
let completions = 0; // difficulty = completions; only wins increment it
let level = null;
let player = null;
let traffic = null;

// M5.6: pre-roll conversation (Jensen) before the level begins.
let dialog = null;
let currentLine = null;
// The event that opened the dialog, so that same keydown does not also
// advance the first line (the handlers fire in one dispatch).
let dialogStartEvent = null;

// Fresh level at the current difficulty + a new Bob on the bottom row.
function newGame() {
  level = generateLevel(completions);
  player = createPlayer(level.grid);
  traffic = createTraffic(level.lanes, level.speed, GRID_COLS);
}

function startGame() {
  const next = nextState(gameState, EVENT.START);
  if (!next) return;
  gameState = next;
  newGame();
}

function retry() {
  const next = nextState(gameState, EVENT.RETRY);
  if (!next) return;
  gameState = next;
  newGame(); // same difficulty (completions unchanged)
}

function nextLevel() {
  const next = nextState(gameState, EVENT.NEXT);
  if (!next) return;
  gameState = next;
  newGame(); // difficulty already bumped when the win happened
}

function toTitle() {
  const next = nextState(gameState, EVENT.TITLE);
  if (!next) return;
  gameState = next;
  level = null;
  player = null;
  traffic = null;
}

// M5.6: start the pre-roll dialog. Lines play with TTS and advance on
// keypress or when each line finishes; finishing starts the level.
function startDialog(openingEvent) {
  if (dialog) return;
  dialogStartEvent = openingEvent;
  dialog = createDialog(LEVEL1_LINES, {
    onLine: (line) => {
      currentLine = line;
      if (isMuted()) return; // no audio; the player advances on key
      playLineAudio(line).then(() => {
        if (currentLine === line && dialog.phase === 'active') dialog.advance();
      });
    },
    onDone: () => {
      stopLineAudio();
      dialog = null;
      currentLine = null;
      startGame();
    },
  });
  dialog.begin();
}

// --- canvas ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cellPx = BASE_CELL_PX;
canvas.width = cellPx * GRID_COLS;
canvas.height = cellPx * GRID_ROWS;

// --- input ---
// M5.6: on the title screen, Enter/click starts the pre-roll dialog
// (which then starts the level when finished).
const detachStart = attachStartHandler(canvas, window, (e) => {
  if (gameState !== STATE.TITLE) return;
  startDialog(e);
});
void detachStart;

// M5.6: dialog keys — Enter/space advances a line, Escape skips it.
const detachDialogKeys = window.addEventListener('keydown', (e) => {
  if (!dialog || dialog.phase !== 'active') return;
  if (e === dialogStartEvent) {
    dialogStartEvent = null; // the opening Enter doesn't advance
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    stopLineAudio();
    dialog.advance();
  } else if (e.key === 'Escape') {
    stopLineAudio();
    dialog.skip();
  }
});
void detachDialogKeys;

// Arrow keys hop Bob one cell (PLAYING only); drown/win end the game.
const detachHop = attachHopHandler(window, (dir) => {
  if (gameState !== STATE.PLAYING) return;
  const result = hop(player, dir, level.grid);
  if (result.result === 'drowned') {
    sfx('drown');
    quip(); // Bob swears mildly (M7 TTS)
    gameState = nextState(gameState, EVENT.DIE);
  } else if (result.result === 'win') {
    sfx('win');
    completions++; // difficulty persists: speed = min(4 + completions, 8)
    gameState = nextState(gameState, EVENT.WIN);
  } else if (result.moved && bobInDanger(traffic, player)) {
    // Bob hopped into a vehicle: squished (collision is bidirectional).
    sfx('crash');
    quip();
    gameState = nextState(gameState, EVENT.DIE);
  } else if (result.result === 'moved') {
    sfx('hop');
  }
});
void detachHop;

// Mute toggle: M key (M7 audio).
const detachMute = window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
void detachMute;

// State-specific keys: R/T on GAME_OVER, Enter/T on WIN.
const detachStateKeys = window.addEventListener('keydown', (e) => {
  if (gameState === STATE.GAME_OVER) {
    if (e.key === 'r' || e.key === 'R') retry();
    if (e.key === 't' || e.key === 'T') toTitle();
  } else if (gameState === STATE.WIN) {
    if (e.key === 'Enter') nextLevel();
    if (e.key === 't' || e.key === 'T') toTitle();
  }
});
void detachStateKeys;

// --- game loop ---
let lastTime = 0;

function frame(t) {
  const dt = Math.min((t - lastTime) / 1000, DT_CLAMP_S);
  lastTime = t;

  update(dt);
  render();

  requestAnimationFrame(frame);
}

function update(dt) {
  if (gameState !== STATE.PLAYING || !traffic) return;
  updateTraffic(traffic, dt);
  // Collision is bidirectional: a vehicle driving into Bob kills him too
  // (checked every frame, not only on Bob's hop).
  if (bobInDanger(traffic, player)) {
    // Vehicle drove into Bob: squished.
    sfx('crash');
    quip();
    gameState = nextState(gameState, EVENT.DIE);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (gameState === STATE.TITLE) {
    drawGrid(ctx, cellPx, true);
    // M5.6: pre-roll dialog overlay, else the plain title overlay.
    if (dialog && dialog.phase === 'active') {
      drawDialog(ctx, cellPx, canvas.width, canvas.height, dialog.current);
    } else {
      drawTitleOverlay(ctx, cellPx, canvas.width, canvas.height);
    }
    return;
  }
  drawLayout(ctx, cellPx, level);
  if (traffic) drawTraffic(ctx, cellPx, traffic);
  if (player) drawPlayer(ctx, cellPx, player);
  if (gameState === STATE.GAME_OVER) {
    drawGameOverOverlay(ctx, cellPx, canvas.width, canvas.height);
  } else if (gameState === STATE.WIN) {
    drawWinOverlay(ctx, cellPx, canvas.width, canvas.height);
  }
}

requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(frame);
});