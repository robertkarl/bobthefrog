// Entry point: boot, requestAnimationFrame loop, state machine wiring.

import { GRID_COLS, GRID_ROWS, BASE_CELL_PX, DT_CLAMP_S } from './config.js';
import { STATE, EVENT, nextState } from './state.js';
import { drawGrid, drawTitleOverlay } from './render.js';
import { attachStartHandler } from './input.js';

// --- state ---
let gameState = STATE.TITLE;
let completions = 0; // difficulty = completions (M4+)

// --- canvas setup ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cellPx = BASE_CELL_PX;
canvas.width = cellPx * GRID_COLS;
canvas.height = cellPx * GRID_ROWS;

// --- input ---
function startGame() {
  if (gameState !== STATE.TITLE) return;
  const next = nextState(gameState, EVENT.START);
  if (next) gameState = next;
}
const detachStart = attachStartHandler(canvas, window, startGame);

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
  // M1: no simulation yet. Vehicle/level updates arrive in M2/M5.
  void dt;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, cellPx, true);
  if (gameState === STATE.TITLE) {
    drawTitleOverlay(ctx, cellPx, canvas.width, canvas.height);
  }
  // M4+: Bob, vehicles, game-over/win overlays.
}

requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(frame);
});