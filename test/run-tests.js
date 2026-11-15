// M1 tests: pure-logic checks runnable under Node (no browser needed).
// Run: node test/run-tests.js   (or: npm test)
//
// Manual verification checklist (visual parts — do in a browser):
//   1. Open index.html; an 18x26 grid of green cells is visible.
//   2. Debug overlay shows column numbers 0..17 along the top and
//      row numbers 0..25 along the left (row 0 at the bottom).
//   3. TITLE overlay shows the title and a "Start" prompt.
//   4. Click the canvas or press Enter -> overlay disappears, grass grid
//      remains (state is now PLAYING).
//   5. The animation loop runs (no console errors; frame keeps ticking).

import { STATE, EVENT, nextState } from '../js/state.js';
import {
  GRID_COLS,
  GRID_ROWS,
  BASE_CELL_PX,
  MAX_CELL_PX,
  cellSizePx,
  canvasSizeFor,
} from '../js/config.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}: expected ${expected}, got ${actual}`);
  }
}

console.log('state machine transitions:');
// TITLE -> PLAYING
check('TITLE + START -> PLAYING', nextState(STATE.TITLE, EVENT.START), STATE.PLAYING);
// PLAYING -> GAME_OVER / WIN
check('PLAYING + DIE -> GAME_OVER', nextState(STATE.PLAYING, EVENT.DIE), STATE.GAME_OVER);
check('PLAYING + WIN -> WIN', nextState(STATE.PLAYING, EVENT.WIN), STATE.WIN);
// GAME_OVER -> retry / title
check('GAME_OVER + RETRY -> PLAYING', nextState(STATE.GAME_OVER, EVENT.RETRY), STATE.PLAYING);
check('GAME_OVER + TITLE -> TITLE', nextState(STATE.GAME_OVER, EVENT.TITLE), STATE.TITLE);
// WIN -> next / title
check('WIN + NEXT -> PLAYING', nextState(STATE.WIN, EVENT.NEXT), STATE.PLAYING);
check('WIN + TITLE -> TITLE', nextState(STATE.WIN, EVENT.TITLE), STATE.TITLE);
// Invalid transitions -> null
check('TITLE + DIE is invalid', nextState(STATE.TITLE, EVENT.DIE), null);
check('PLAYING + START is invalid', nextState(STATE.PLAYING, EVENT.START), null);
check('unknown state is invalid', nextState('BOGUS', EVENT.START), null);
check('unknown event is invalid', nextState(STATE.TITLE, 'BOGUS'), null);

console.log('grid sizing:');
check('grid is >= 16 wide', GRID_COLS >= 16, true);
check('grid is >= 25 tall', GRID_ROWS >= 25, true);
check('base cell px is positive', BASE_CELL_PX > 0, true);
// cellSizePx: largest square cell fitting a given canvas, capped.
check('cell fits 1024x1024 canvas (height-bound)', cellSizePx(1024, 1024), 39);
check('cell capped at max on huge canvas', cellSizePx(2000, 2000), MAX_CELL_PX);
check('cell fits 512x800 canvas (width-bound)', cellSizePx(512, 800), 28);
check('cell fits tiny canvas (min 1px)', cellSizePx(10, 10), 1);
// canvasSizeFor round-trip.
const { width, height } = canvasSizeFor(32);
check('canvas width = cols * cell', width, GRID_COLS * 32);
check('canvas height = rows * cell', height, GRID_ROWS * 32);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);