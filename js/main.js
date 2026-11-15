// Entry point: boot, requestAnimationFrame loop, state machine wiring.

import { GRID_COLS, GRID_ROWS, BASE_CELL_PX, DT_CLAMP_S } from './config.js';
import { STATE, EVENT, nextState } from './state.js';
import {
  drawGrid,
  drawLayout,
  drawPlayer,
  drawTitleOverlay,
  drawGameOverOverlay,
  drawWinOverlay,
} from './render.js';
import { generateLevel } from './levelgen/index.js';
import { attachStartHandler, attachHopHandler } from './input.js';
import { createPlayer, hop } from './player.js';

// --- state ---
let gameState = STATE.TITLE;
let completions = 0; // difficulty = completions; only wins increment it
let level = null;
let player = null;

// Fresh level at the current difficulty + a new Bob on the bottom row.
function newGame() {
  level = generateLevel(completions);
  player = createPlayer(level.grid);
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
}

// --- canvas ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cellPx = BASE_CELL_PX;
canvas.width = cellPx * GRID_COLS;
canvas.height = cellPx * GRID_ROWS;

// --- input ---
const detachStart = attachStartHandler(canvas, window, startGame);
void detachStart;

// Arrow keys hop Bob one cell (PLAYING only); drown/win end the game.
const detachHop = attachHopHandler(window, (dir) => {
  if (gameState !== STATE.PLAYING) return;
  const result = hop(player, dir, level.grid);
  if (result.result === 'drowned') {
    gameState = nextState(gameState, EVENT.DIE);
  } else if (result.result === 'win') {
    completions++; // difficulty persists: speed = min(4 + completions, 8)
    gameState = nextState(gameState, EVENT.WIN);
  }
});
void detachHop;

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
  // M4: Bob hops are event-driven (one hop per keypress).
  // Vehicle simulation arrives in M5.
  void dt;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (gameState === STATE.TITLE) {
    drawGrid(ctx, cellPx, true);
    drawTitleOverlay(ctx, cellPx, canvas.width, canvas.height);
    return;
  }
  drawLayout(ctx, cellPx, level);
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