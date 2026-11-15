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
import { generateLayout, validateLayout } from '../js/levelgen/layout.js';

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

// --- M2: level layout generation + adjacency validation ---

// Independent checker (deliberately separate from layout.js's own
// validateLayout): re-derives the hard constraints from the grid +
// metadata and returns a list of violations.
function layoutViolations(level) {
  const { grid, lanes, rivers } = level;
  const v = [];
  const rowBase = (r) => grid[r][0].base;
  const validBases = new Set(['grass', 'asphalt', 'sidewalk', 'water', 'lilypad', 'localhost-lilypad']);

  // Every cell has exactly one type.
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r][c];
      if (!validBases.has(cell.base) || cell.obstacle !== null) v.push(`cell (${r},${c})`);
    }
  }

  // Row 0 all grass; top 2 rows all water.
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[0][c].base !== 'grass') v.push('row 0 not grass');
    if (grid[GRID_ROWS - 2][c].base !== 'water' || grid[GRID_ROWS - 1][c].base !== 'water') {
      v.push('top 2 rows not water');
    }
  }

  // Lanes: exactly 2 rows tall, full width, has a direction.
  const laneRows = new Set();
  for (const lane of lanes) {
    if (lane.rows.length !== 2) v.push('lane not 2 rows tall');
    if (lane.dir !== 'left' && lane.dir !== 'right') v.push('lane has no direction');
    for (const r of lane.rows) {
      if (rowBase(r) !== 'asphalt') v.push(`lane row ${r} not asphalt`);
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].base !== 'asphalt') v.push(`lane row ${r} col ${c} not asphalt`);
      }
      laneRows.add(r);
    }
  }
  // No asphalt outside declared lanes.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) === 'asphalt' && !laneRows.has(r)) v.push(`stray asphalt row ${r}`);
  }

  // Adjacent lane pairs have opposite directions.
  const sorted = [...lanes].sort((a, b) => a.rows[0] - b.rows[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].rows[0] === sorted[i - 1].rows[1] + 1 && sorted[i].dir === sorted[i - 1].dir) {
      v.push('adjacent lanes same direction');
    }
  }

  // Rivers: 2 rows tall; no water outside declared rivers.
  const riverRows = new Set();
  for (const river of rivers) {
    if (river.rows.length !== 2) v.push('river not 2 rows tall');
    for (const r of river.rows) {
      if (rowBase(r) !== 'water') v.push(`river row ${r} not water`);
      riverRows.add(r);
    }
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) === 'water' && !riverRows.has(r)) v.push(`stray water row ${r}`);
  }

  // Rivers border only grass or the top edge (check each river's outer rows).
  for (const river of rivers) {
    const lo = river.rows[0];
    const hi = river.rows[1];
    if (lo - 1 >= 0 && rowBase(lo - 1) !== 'grass') v.push(`river ${lo}-${hi} touches non-grass below`);
    if (hi + 1 < GRID_ROWS && rowBase(hi + 1) !== 'grass') v.push(`river ${lo}-${hi} touches non-grass above`);
  }

  // Sidewalks border a lane on one side and grass on the other.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) !== 'sidewalk') continue;
    const above = r + 1 < GRID_ROWS ? rowBase(r + 1) : null;
    const below = r - 1 >= 0 ? rowBase(r - 1) : null;
    const aboveLane = above === 'asphalt' && laneRows.has(r + 1);
    const belowLane = below === 'asphalt' && laneRows.has(r - 1);
    if (aboveLane + belowLane !== 1) v.push(`sidewalk row ${r} must border a lane on exactly one side`);
    if (aboveLane && below !== 'grass') v.push(`sidewalk row ${r} must border grass below`);
    if (belowLane && above !== 'grass') v.push(`sidewalk row ${r} must border grass above`);
  }

  // Everything that is not a lane/river/sidewalk row is grass.
  for (let r = 0; r < GRID_ROWS; r++) {
    const isFeature = laneRows.has(r) || riverRows.has(r) || rowBase(r) === 'sidewalk';
    if (!isFeature && rowBase(r) !== 'grass') v.push(`row ${r} is ${rowBase(r)} but not a feature`);
  }

  return v;
}

console.log('layout generation (200 levels):');
const N_LAYOUTS = 200;
let layoutFailures = 0;
for (let i = 0; i < N_LAYOUTS; i++) {
  const layout = generateLayout();
  const validatorErrors = validateLayout(layout);
  const independent = layoutViolations(layout);
  if (validatorErrors.length > 0 || independent.length > 0) {
    layoutFailures++;
    console.error(`  layout ${i}: ${[...validatorErrors, ...independent].join('; ')}`);
  }
}
check('all 200 generated layouts satisfy the hard constraints', layoutFailures, 0);

// Spot-check one layout's shape: lanes and rivers tile disjoint row ranges.
const sample = generateLayout();
const allFeatureRows = new Set();
for (const l of sample.lanes) for (const r of l.rows) allFeatureRows.add(r);
for (const rv of sample.rivers) for (const r of rv.rows) allFeatureRows.add(r);
const overlaps = [];
for (const l of sample.lanes) for (const rv of sample.rivers) {
  if (l.rows.some((r) => rv.rows.includes(r))) overlaps.push(1);
}
check('lane/river rows are disjoint', overlaps.length, 0);
check('no feature touches row 0', [...allFeatureRows].some((r) => r === 0), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);