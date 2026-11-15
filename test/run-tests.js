// M1/M2/M3 tests: pure-logic checks runnable under Node (no browser needed).
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
import { generateLevel } from '../js/levelgen/index.js';
import { validateLevel } from '../js/levelgen/validate.js';

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
  const riverCells = new Set(['water', 'lilypad', 'localhost-lilypad']);

  // Every cell has a valid type; obstacles are placed correctly
  // (bush on grass, pylon on sidewalk).
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r][c];
      if (!validBases.has(cell.base)) v.push(`cell (${r},${c}) bad base`);
      if (cell.obstacle === 'bush' && cell.base !== 'grass') v.push(`bush at (${r},${c}) not on grass`);
      if (cell.obstacle === 'pylon' && cell.base !== 'sidewalk') v.push(`pylon at (${r},${c}) not on sidewalk`);
      if (cell.obstacle !== null && cell.obstacle !== 'bush' && cell.obstacle !== 'pylon') {
        v.push(`bad obstacle at (${r},${c})`);
      }
    }
  }

  // Row 0 all grass, no obstacles.
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[0][c].base !== 'grass') v.push('row 0 not grass');
    if (grid[0][c].obstacle !== null) v.push('row 0 obstacle');
  }

  // Lanes: exactly 2 rows tall, full width, has a direction.
  const laneRows = new Set();
  for (const lane of lanes) {
    if (lane.rows.length !== 2) v.push('lane not 2 rows tall');
    if (lane.dir !== 'left' && lane.dir !== 'right') v.push('lane has no direction');
    for (const r of lane.rows) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].base !== 'asphalt') v.push(`lane row ${r} col ${c} not asphalt`);
      }
      laneRows.add(r);
    }
  }
  // No asphalt outside declared lanes.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (laneRows.has(r)) continue;
    if (grid[r].some((cell) => cell.base === 'asphalt')) v.push(`stray asphalt row ${r}`);
  }

  // Adjacent lane pairs have opposite directions.
  const sorted = [...lanes].sort((a, b) => a.rows[0] - b.rows[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].rows[0] === sorted[i - 1].rows[1] + 1 && sorted[i].dir === sorted[i - 1].dir) {
      v.push('adjacent lanes same direction');
    }
  }

  // Rivers: 2 rows tall, water/lilypad only; no water outside declared rivers.
  const riverRows = new Set();
  for (const river of rivers) {
    if (river.rows.length !== 2) v.push('river not 2 rows tall');
    for (const r of river.rows) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!riverCells.has(grid[r][c].base)) v.push(`river row ${r} col ${c} not water/lilypad`);
      }
      riverRows.add(r);
    }
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    if (riverRows.has(r)) continue;
    if (grid[r].some((cell) => cell.base === 'water')) v.push(`stray water row ${r}`);
  }

  // Rivers border only grass or the top edge (check each river's outer rows).
  for (const river of rivers) {
    const lo = river.rows[0];
    const hi = river.rows[1];
    if (lo - 1 >= 0 && rowBase(lo - 1) !== 'grass') v.push(`river ${lo}-${hi} touches non-grass below`);
    if (hi + 1 < GRID_ROWS && rowBase(hi + 1) !== 'grass') v.push(`river ${lo}-${hi} touches non-grass above`);
  }

  // Sidewalks are full-width and border a lane on one side and grass on the other.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) !== 'sidewalk') continue;
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].base !== 'sidewalk') v.push(`sidewalk row ${r} col ${c} not sidewalk`);
    }
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
    if (!isFeature) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].base !== 'grass') v.push(`row ${r} col ${c} not grass`);
      }
    }
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

// --- M3: hazards, lilypads, BFS validation ---

console.log('M3: hazards, lilypads, BFS validation (200 levels):');
const N_LEVELS = 200;
let genFailures = 0;
let densityFailures = 0;
let crossingFailures = 0;
let goalFailures = 0;

for (let i = 0; i < N_LEVELS; i++) {
  const level = generateLevel(0);
  const result = validateLevel(level);

  // BFS finds every goal.
  if (!result.ok || result.reachable.length !== level.goals.length) {
    genFailures++;
    console.error(`  level ${i}: ${result.errors.join('; ')}`);
  }

  // Densities: bushes ≤ 15% of grass (excluding row 0), pylons ≤ 15% of sidewalk.
  let grass = 0, bushes = 0, sidewalk = 0, pylons = 0;
  for (let r = 1; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = level.grid[r][c];
      if (cell.base === 'grass') {
        grass++;
        if (cell.obstacle === 'bush') bushes++;
      }
      if (cell.base === 'sidewalk') {
        sidewalk++;
        if (cell.obstacle === 'pylon') pylons++;
      }
    }
  }
  if (grass > 0 && bushes / grass > 0.15) densityFailures++;
  if (sidewalk > 0 && pylons / sidewalk > 0.15) densityFailures++;

  // No bush on row 0.
  if (level.grid[0].some((cell) => cell.obstacle === 'bush')) densityFailures++;

  // Every river has a traversable crossing (a column where both rows are
  // lilypad / localhost-lilypad).
  for (const river of level.rivers) {
    const [lo, hi] = river.rows;
    const crossed = level.grid[lo].some(
      (cell, c) =>
        (cell.base === 'lilypad' || cell.base === 'localhost-lilypad') &&
        (level.grid[hi][c].base === 'lilypad' || level.grid[hi][c].base === 'localhost-lilypad')
    );
    if (!crossed) crossingFailures++;
  }

  // ≥ 3 Localhost Lilypads in the goal river, all reachable.
  if (level.goals.length < 3) goalFailures++;
  if (!result.ok || result.reachable.length !== level.goals.length) goalFailures++;
}
check('BFS finds all goals in 200 generated levels', genFailures, 0);
check('bush/pylon densities ≤ 15% (and no bush on row 0)', densityFailures, 0);
check('every river has a traversable crossing', crossingFailures, 0);
check('≥ 3 reachable Localhost Lilypads in the goal river', goalFailures, 0);

// --- M3 negative tests: mutations of a valid level must be caught ---

console.log('M3 negative tests (mutations must be caught):');

function cloneLevel(level) {
  return {
    grid: level.grid.map((row) => row.map((cell) => ({ ...cell }))),
    lanes: level.lanes.map((l) => ({ rows: [...l.rows], dir: l.dir })),
    rivers: level.rivers.map((r) => ({ rows: [...r.rows] })),
    goals: level.goals.map((g) => [...g]),
  };
}

function findCell(grid, base) {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].base === base) return [r, c];
    }
  }
  return null;
}

// A level that has at least one sidewalk (for the sidewalk mutations).
let base = generateLevel(0);
while (!base.grid.some((row) => row.some((cell) => cell.base === 'sidewalk'))) {
  base = generateLevel(0);
}
check('unmutated level passes validator + BFS', validateLevel(base).ok, true);
check('unmutated level passes independent checker', layoutViolations(base).length, 0);

// 1. Bush on row 0 (Bob's safe start strip).
{
  const m = cloneLevel(base);
  m.grid[0][0].obstacle = 'bush';
  check('bush on row 0 flagged (validator)', validateLayout(m).length > 0, true);
  check('bush on row 0 flagged (independent)', layoutViolations(m).length > 0, true);
}

// 2. Bush on asphalt.
{
  const m = cloneLevel(base);
  const [r, c] = findCell(m.grid, 'asphalt');
  m.grid[r][c].obstacle = 'bush';
  check('bush on asphalt flagged (validator)', validateLayout(m).length > 0, true);
  check('bush on asphalt flagged (independent)', layoutViolations(m).length > 0, true);
}

// 3. Pylon on grass.
{
  const m = cloneLevel(base);
  const [r, c] = findCell(m.grid, 'grass');
  m.grid[r][c].obstacle = 'pylon';
  check('pylon on grass flagged (validator)', validateLayout(m).length > 0, true);
  check('pylon on grass flagged (independent)', layoutViolations(m).length > 0, true);
}

// 4. Bush on sidewalk.
{
  const m = cloneLevel(base);
  const [r, c] = findCell(m.grid, 'sidewalk');
  m.grid[r][c].obstacle = 'bush';
  check('bush on sidewalk flagged (validator)', validateLayout(m).length > 0, true);
  check('bush on sidewalk flagged (independent)', layoutViolations(m).length > 0, true);
}

// 5. Grass in a river row.
{
  const m = cloneLevel(base);
  const [r, c] = findCell(m.grid, 'water');
  m.grid[r][c].base = 'grass';
  check('grass in river row flagged (validator)', validateLayout(m).length > 0, true);
  check('grass in river row flagged (independent)', layoutViolations(m).length > 0, true);
}

// 6. Fewer than 3 Localhost Lilypads.
{
  const m = cloneLevel(base);
  const demote = m.goals.slice(0, m.goals.length - 2);
  for (const [r, c] of demote) m.grid[r][c] = { base: 'lilypad', obstacle: null };
  check('fewer than 3 localhosts fails validation', validateLevel(m).ok, false);
}

// 7. A bush wall across the grass row above the goal river blocks the path.
{
  const m = cloneLevel(base);
  const r = GRID_ROWS - 3; // always the grass row separating the goal river
  for (let c = 0; c < GRID_COLS; c++) m.grid[r][c].obstacle = 'bush';
  check('bush wall across a grass row fails BFS', validateLevel(m).ok, false);
}

// 8. Removing the goal river's supporting lilypads makes every Localhost
//    unreachable (the top row can only be entered from the row below).
{
  const m = cloneLevel(base);
  for (const [r, c] of m.goals) {
    m.grid[r - 1][c] = { base: 'water', obstacle: null };
  }
  check('removed goal-river supports fail BFS', validateLevel(m).ok, false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);