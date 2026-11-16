// M1-M7 tests: pure-logic checks runnable under Node (no browser needed).
// Run: node test/run-tests.js   (or: npm test)
//
// Manual verification checklist (visual/audio parts — do in a browser):
//   1. Open index.html; an 18x26 grid of green cells is visible.
//   2. Debug overlay shows column numbers 0..17 along the top and
//      row numbers 0..25 along the left (row 0 at the bottom).
//   3. TITLE overlay shows the title and a "Start" prompt.
//   4. Click the canvas or press Enter -> overlay disappears, grass grid
//      remains (state is now PLAYING).
//   5. The animation loop runs (no console errors; frame keeps ticking).
//   M8 (sprites) — visual: sprites replace the colored rectangles once loaded:
//      tiles, bushes/pylons, Bob, cars/trucks; title & game-over screens use
//      the generated 512px images (fitted, no stretch). Rectangles remain as
//      the fallback if any image fails to load.
//   M7 (audio) — after the first keypress unlocks the AudioContext:
//   6. Each successful hop plays a short rising blip ('hop').
//   7. Hopping into water plays a sinking sweep + splash ('drown') and
//      Bob speaks a mild quip ("Damn.", "Crap.", ...) from the
//      pre-generated bobthefrog WAV clip (falls back to TTS if a clip
//      fails to load).
//   8. Reaching a Localhost Lilypad plays a short jingle ('win').
//   9. Pressing M mutes everything (no hop blips, no quips); pressing M
//      again restores sound. Default is sound ON.
//   10. In a browser without speechSynthesis (or muted), death is silent
//      and nothing throws in the console.
//   M5.6 (pre-roll conversation) — after the first keypress unlocks audio:
//   11. Title screen: Enter/click opens the pre-roll dialog (Jensen box
//       with pixel headshot + large text, Stardew-style).
//   12. Line 1 plays with the cloned Jensen voice (WAV clip); Enter/space
//       advances a line, and each line also auto-advances when it finishes.
//   13. Line 2 (serious Jensen) plays; finishing it starts the level.
//   14. Escape skips the whole dialog and starts the level immediately.

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
import { createPlayer, hop } from '../js/player.js';
import {
  createTraffic,
  updateTraffic,
  bobInDanger,
  vehicleOverlapsCell,
  speedFor,
  SPAWN_MIN_S,
  CAR_WIDTH,
  TRUCK_WIDTH,
} from '../js/vehicles.js';

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

// --- M4: Bob movement, win/lose, difficulty persistence ---

console.log('M4: Bob movement (synthetic grid):');

function makeTestGrid() {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid.push(Array.from({ length: GRID_COLS }, () => ({ base: 'grass', obstacle: null })));
  }
  return grid;
}

const g = makeTestGrid();
const p = createPlayer(g);
check('player starts on row 0', p.row, 0);
check('player starts in bounds', p.col >= 0 && p.col < GRID_COLS, true);

// Orthogonal hops move exactly one cell.
p.row = 0;
p.col = 5;
let hopRes = hop(p, 'up', g);
check('hop up moves one cell', p.row, 1);
check('hop up is a plain move', hopRes.result, 'moved');
hopRes = hop(p, 'left', g);
check('hop left moves one cell', p.col, 4);
hopRes = hop(p, 'down', g);
check('hop down returns to row 0', p.row, 0);

// Out-of-bounds hops are ignored (no move, no crash).
p.row = 0;
p.col = 0;
hopRes = hop(p, 'left', g);
check('hop left at col 0 is blocked', hopRes.result, 'blocked');
check('hop left at col 0 does not move', p.col, 0);
p.col = GRID_COLS - 1;
hopRes = hop(p, 'right', g);
check('hop right at last col is blocked', hopRes.result, 'blocked');
hopRes = hop(p, 'down', g);
check('hop down from row 0 is blocked', hopRes.result, 'blocked');
check('hop down from row 0 does not move', p.row, 0);

// Unknown direction is a no-op.
hopRes = hop(p, 'diagonal', g);
check('diagonal hop is blocked', hopRes.result, 'blocked');

// Obstacles: bushes and pylons block the hop.
g[1][5] = { base: 'grass', obstacle: 'bush' };
p.row = 0;
p.col = 5;
hopRes = hop(p, 'up', g);
check('hop into a bush is blocked', hopRes.result, 'blocked');
check('hop into a bush does not move', p.row, 0);
g[1][5] = { base: 'sidewalk', obstacle: 'pylon' };
hopRes = hop(p, 'up', g);
check('hop into a pylon is blocked', hopRes.result, 'blocked');

// Water: drown.
g[1][5] = { base: 'water', obstacle: null };
hopRes = hop(p, 'up', g);
check('hop into water drowns', hopRes.result, 'drowned');
check('drowned hop moves Bob into the water', p.row, 1);

// A plain lilypad is safe traversal (no win).
g[1][5] = { base: 'lilypad', obstacle: null };
p.row = 0;
p.col = 5;
hopRes = hop(p, 'up', g);
check('hop onto a plain lilypad is a plain move', hopRes.result, 'moved');

// A Localhost Lilypad wins.
g[1][5] = { base: 'localhost-lilypad', obstacle: null };
p.row = 0;
p.col = 5;
hopRes = hop(p, 'up', g);
check('hop onto a Localhost Lilypad wins', hopRes.result, 'win');

// State transitions for the M4 outcomes.
check('win transition: PLAYING + WIN -> WIN', nextState(STATE.PLAYING, EVENT.WIN), STATE.WIN);
check('drown transition: PLAYING + DIE -> GAME_OVER', nextState(STATE.PLAYING, EVENT.DIE), STATE.GAME_OVER);

console.log('M4: difficulty persistence (speed formula):');
// speed = min(4 + completions, 8); completions persist across levels.
check('completions 0 -> speed 4', generateLevel(0).speed, 4);
check('completions 3 -> speed 7', generateLevel(3).speed, 7);
check('completions 4 -> speed 8 (cap)', generateLevel(4).speed, 8);
check('completions 10 -> speed 8 (cap)', generateLevel(10).speed, 8);

// M3 carry-over: the forced-fix fallback (strip all obstacles) must be
// exercised by a test. Wall the grass row above the goal river, confirm
// the validator fails, then strip every obstacle and confirm it passes.
console.log('M3 carry-over: forced-fix fallback (strip obstacles):');
{
  const m = cloneLevel(base);
  const r = GRID_ROWS - 3; // always the grass row above the goal river
  for (let c = 0; c < GRID_COLS; c++) m.grid[r][c].obstacle = 'bush';
  check('walled row above goal river fails BFS', validateLevel(m).ok, false);
  for (let rr = 0; rr < GRID_ROWS; rr++) {
    for (let c = 0; c < GRID_COLS; c++) m.grid[rr][c].obstacle = null;
  }
  check('stripping all obstacles makes the level validate', validateLevel(m).ok, true);
}

// --- M5: traffic, vehicles, collision ---

console.log('M5: collision (interval overlap, not floor-based):');

// The known off-by-one (REVIEW.md): a vehicle at x=3.5 width 2 spans
// [3.5, 5.5), i.e. columns 3, 4, 5. Bob at c=5 (the trailing column)
// MUST collide. A floor-based range c ∈ [floor(x), floor(x)+width-1] =
// [3, 4] misses it.
const fracV = { lane: 0, x: 3.5, width: 2, kind: 'car' };
check('fractional x: Bob at trailing column collides', vehicleOverlapsCell(fracV, 5), true);
// The floor-based method (documented bug — must NOT be used):
const floorBased = (vv, c) => c >= Math.floor(vv.x) && c <= Math.floor(vv.x) + vv.width - 1;
check('floor-based range misses the trailing column (the bug)', floorBased(fracV, 5), false);
check('floor-based range misses a truck trailing column (c=7)', floorBased({ x: 3.5, width: 4 }, 7), false);
check('interval method catches the truck trailing column', vehicleOverlapsCell({ lane: 0, x: 3.5, width: 4, kind: 'truck' }, 7), true);

// Leading edge and clear edges.
check('leading column collides (c=3)', vehicleOverlapsCell(fracV, 3), true);
check('just before the leading edge is clear (c=2)', vehicleOverlapsCell(fracV, 2), false);
check('just past the trailing edge is clear (c=6)', vehicleOverlapsCell(fracV, 6), false);

// Integer x still works (both edges inclusive via interval overlap).
const intV = { lane: 0, x: 3, width: 2, kind: 'car' };
check('integer x: c=3 collides', vehicleOverlapsCell(intV, 3), true);
check('integer x: c=4 collides', vehicleOverlapsCell(intV, 4), true);
check('integer x: c=5 clear', vehicleOverlapsCell(intV, 5), false);

console.log('M5: bobInDanger (lane rows + interval overlap):');
{
  const lanes = [
    { rows: [5, 6], dir: 'left' },
    { rows: [9, 10], dir: 'right' },
  ];
  const traffic = createTraffic(lanes, 4, GRID_COLS, () => 0.5);
  traffic.lanes[0].vehicles.push({ lane: 0, x: 5, width: 2, kind: 'car' });
  check('Bob in lane row + inside footprint dies', bobInDanger(traffic, { row: 5, col: 6 }), true);
  check('Bob in lane row + leading edge dies', bobInDanger(traffic, { row: 5, col: 5 }), true);
  check('Bob in the lane\'s other row dies (full lane height)', bobInDanger(traffic, { row: 6, col: 6 }), true);
  check('Bob just past the trailing edge survives', bobInDanger(traffic, { row: 5, col: 7 }), false);
  check('Bob on a non-lane row survives', bobInDanger(traffic, { row: 7, col: 6 }), false);
  check('Bob in the other lane survives', bobInDanger(traffic, { row: 9, col: 6 }), false);

  // Fractional trailing edge: vehicle [5.5, 7.5) hits Bob at col 7.
  traffic.lanes[0].vehicles.push({ lane: 0, x: 5.5, width: 2, kind: 'car' });
  check('fractional trailing edge: Bob at col 7 dies', bobInDanger(traffic, { row: 5, col: 7 }), true);
}

console.log('M5: speed ramp (base 4, +1 per win, cap 8):');
check('speedFor(0) = 4', speedFor(0), 4);
check('speedFor(1) = 5', speedFor(1), 5);
check('speedFor(3) = 7', speedFor(3), 7);
check('speedFor(4) = 8 (cap)', speedFor(4), 8);
check('speedFor(10) = 8 (cap)', speedFor(10), 8);

console.log('M5: simulated traffic (deterministic, 30 s):');
{
  // Deterministic RNG so the run is reproducible.
  function makeDeterministicRand(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 110351552 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  const lanes = [
    { rows: [4, 5], dir: 'left' },
    { rows: [8, 9], dir: 'right' },
  ];
  const traffic = createTraffic(lanes, 4, GRID_COLS, makeDeterministicRand(20250607));

  const spawnTimes = new Map();
  for (const lane of traffic.lanes) spawnTimes.set(lane.index, []);

  let overlapViolations = 0;
  let widthViolations = 0;
  let boundsViolations = 0;
  let minSpawns = Infinity;

  const SIM_STEPS = 300; // 30 s at dt = 0.1
  for (let step = 1; step <= SIM_STEPS; step++) {
    const events = updateTraffic(traffic, 0.1);
    const t = step * 0.1;
    for (const e of events) spawnTimes.get(e.lane).push(t);

    for (const lane of traffic.lanes) {
      const vs = lane.vehicles;
      // No two vehicles in a lane may overlap.
      for (let i = 0; i < vs.length; i++) {
        for (let j = i + 1; j < vs.length; j++) {
          const a = vs[i], b = vs[j];
          if (a.x < b.x + b.width && b.x < a.x + a.width) overlapViolations++;
        }
      }
      for (const v of vs) {
        if (v.width !== CAR_WIDTH && v.width !== TRUCK_WIDTH) widthViolations++;
        // Vehicles stay within the plausible range (fully off-screen ones
        // are removed the same step).
        if (lane.dir === 'left' && (v.x > GRID_COLS || v.x + v.width < 0)) boundsViolations++;
        if (lane.dir === 'right' && (v.x >= GRID_COLS || v.x < -v.width)) boundsViolations++;
      }
    }
  }

  let intervalViolations = 0;
  for (const lane of traffic.lanes) {
    const times = spawnTimes.get(lane.index);
    minSpawns = Math.min(minSpawns, times.length);
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] < SPAWN_MIN_S - 1e-9) intervalViolations++;
    }
  }

  check('no two spawns in a lane closer than 2 s', intervalViolations, 0);
  check('every lane spawned at least 2 vehicles in 30 s', minSpawns >= 2, true);
  check('no overlapping vehicles in a lane over the run', overlapViolations, 0);
  check('all vehicle widths are 2 (car) or 4 (truck)', widthViolations, 0);
  check('vehicles stay in range and despawn cleanly', boundsViolations, 0);

  const kinds = new Set();
  for (const lane of traffic.lanes) for (const v of lane.vehicles) kinds.add(v.kind);
  check('both cars and trucks appear over the run', kinds.has('car') && kinds.has('truck'), true);
}

// M4 carry-over: drive the REAL forced-fix fallback path in generateLevel.
// A stubbed hazard placer walls the grass row above the goal river, so every
// attempt fails BFS validation; the fallback (strip all obstacles) must still
// return a valid, solvable level.
console.log('M4 carry-over: forced-fix fallback in generateLevel (stubbed hazards):');
{
  let stubCalls = 0;
  const wallingHazards = (layout) => {
    stubCalls++;
    const r = GRID_ROWS - 3; // the grass row above the goal river
    for (let c = 0; c < GRID_COLS; c++) layout.grid[r][c].obstacle = 'bush';
  };
  const level = generateLevel(0, { placeHazards: wallingHazards });
  check('stubbed hazards force all 5 retries (fallback path taken)', stubCalls, 5);
  check('forced-fix fallback returns a validating level', validateLevel(level).ok, true);
  check('fallback level has >= 3 goals', level.goals.length >= 3, true);
  check('BFS reaches every goal in the fallback level', validateLevel(level).reachable.length, level.goals.length);
}
// --- M7: SFX & TTS (pure-logic parts; browser audio is manual, see above) ---

console.log('M7: SFX & TTS (pure logic):');

import { sfx, quip, pickQuip, toggleMute, setMuted, isMuted, SFX, QUIPS, EVENT_SFX, QUIP_CLIPS, quipClip } from '../js/audio.js';
import {
  LEVEL1_LINES,
  createDialog,
  playLineAudio,
  stopLineAudio,
} from '../js/dialog.js';
import { wrapText } from '../js/dialog-draw.js';

// Mute state: default on (not muted), toggle flips, setMuted sticks.
check('audio starts unmuted', isMuted(), false);
check('toggleMute mutes', toggleMute(), true);
check('isMuted after toggle', isMuted(), true);
check('toggleMute unmutes', toggleMute(), false);
check('setMuted(true) mutes', setMuted(true), undefined);
check('isMuted after setMuted(true)', isMuted(), true);
check('setMuted(false) unmutes', setMuted(false), undefined);
check('isMuted after setMuted(false)', isMuted(), false);

// Event -> SFX mapping is complete and distinct.
check('mapping covers hop', EVENT_SFX.hop, SFX.HOP);
check('mapping covers drown', EVENT_SFX.drown, SFX.DROWN);
check('mapping covers crash', EVENT_SFX.crash, SFX.CRASH);
check('mapping covers win', EVENT_SFX.win, SFX.WIN);
check('mapping covers levelup', EVENT_SFX.levelup, SFX.TICK);
const distinct = new Set(Object.values(EVENT_SFX));
check('all mapped SFX are distinct', distinct.size, 5);

// Quip selection: always a member of the list; deterministic with a fixed rng.
check('quip list is non-empty', QUIPS.length > 0, true);
check('pickQuip(rng=0) is first quip', pickQuip(() => 0), QUIPS[0]);
check('pickQuip(rng=0.99) is last quip', pickQuip(() => 0.99), QUIPS[QUIPS.length - 1]);
const rng = () => Math.random();
for (let i = 0; i < 50; i++) {
  if (!QUIPS.includes(pickQuip(rng))) {
    check('pickQuip always from list', true, false);
    break;
  }
}
check('pickQuip always from list', true, true);

// sfx()/quip() are safe no-ops under Node (no AudioContext/speechSynthesis).
let threw = false;
try {
  sfx('hop');
  sfx('drown');
  sfx('crash');
  sfx('win');
  sfx('tick');
  sfx('nonsense');
  quip();
} catch {
  threw = true;
}
check('sfx/quip are safe no-ops under Node', threw, false);

// M7.1: quip -> clip mapping (pure logic; clips are WAV files on disk).
console.log('M7.1: quip clip mapping:');
check('every quip has a clip file', QUIPS.every((q) => QUIP_CLIPS[q] !== undefined), true);
check('clip map covers exactly the quip list', Object.keys(QUIP_CLIPS).length, QUIPS.length);
check('quipClip("Damn.") -> quip-damn.wav', quipClip('Damn.'), 'assets/audio/quip-damn.wav');
check('quipClip("Well, that hurt.") -> quip-well-that-hurt.wav', quipClip('Well, that hurt.'), 'assets/audio/quip-well-that-hurt.wav');
check('quipClip("Crap.") -> quip-crap.wav', quipClip('Crap.'), 'assets/audio/quip-crap.wav');
check('quipClip("Ouch.") -> quip-ouch.wav', quipClip('Ouch.'), 'assets/audio/quip-ouch.wav');
check('quipClip("Blast it.") -> quip-blast-it.wav', quipClip('Blast it.'), 'assets/audio/quip-blast-it.wav');
check('quipClip on unmapped text -> null', quipClip('Bogus!'), null);
const quipAssetUrl = (rel) => new URL(rel, new URL('../', import.meta.url));
let missingQuipClips = 0;
for (const f of Object.values(QUIP_CLIPS)) {
  if (!existsSync(quipAssetUrl(f))) missingQuipClips++;
}
check('all quip clip files exist on disk', missingQuipClips, 0);

// Muted quip is a silent no-op (mute state respected).
setMuted(true);
let mutedQuipThrew = false;
try {
  quip();
} catch {
  mutedQuipThrew = true;
}
setMuted(false);
check('muted quip is a safe no-op', mutedQuipThrew, false);

// --- M8: sprite mapping (pure mapping in js/sprites.js; assets on disk) ---

import {
  TILE_SPRITES,
  OBSTACLE_SPRITES,
  VEHICLE_SPRITES,
  PLAYER_SPRITE,
  SCREEN_IMAGES,
  tileSprite,
  obstacleSprite,
  vehicleSprite,
  playerSprite,
  screenImage,
  spriteFile,
  screenFile,
} from '../js/sprites.js';
import { existsSync } from 'node:fs';

const assetUrl = (rel) => new URL(rel, new URL('../', import.meta.url));

console.log('M8: sprite mapping:');
// Tile sprites cover every base type the layout can produce.
check('tile: asphalt', tileSprite('asphalt'), 'asphalt.png');
check('tile: grass', tileSprite('grass'), 'grass.png');
check('tile: sidewalk', tileSprite('sidewalk'), 'sidewalk.png');
check('tile: water', tileSprite('water'), 'water.png');
check('tile: lilypad', tileSprite('lilypad'), 'lilypad.png');
check('tile: localhost-lilypad', tileSprite('localhost-lilypad'), 'localhost_lilypad.png');
check('tile: unknown base -> null', tileSprite('bogus'), null);

check('obstacle: bush', obstacleSprite('bush'), 'bush.png');
check('obstacle: pylon', obstacleSprite('pylon'), 'pylon.png');
check('obstacle: unknown -> null', obstacleSprite('bogus'), null);

check('vehicle: car', vehicleSprite('car'), 'car.png');
check('vehicle: truck', vehicleSprite('truck'), 'truck.png');
check('vehicle: unknown -> null', vehicleSprite('bogus'), null);

check('player sprite is bob.png', playerSprite(), 'bob.png');
check('screen: TITLE', screenImage('TITLE'), SCREEN_IMAGES.title);
check('screen: GAME_OVER', screenImage('GAME_OVER'), SCREEN_IMAGES.gameover);
check('screen: other states -> null', screenImage('PLAYING'), null);
check('screens use the 512 variants', SCREEN_IMAGES.title.endsWith('_512.png') && SCREEN_IMAGES.gameover.endsWith('_512.png'), true);

// Every mapped file must exist on disk (paths resolve relative to the repo).
const mapped = [
  ...Object.values(TILE_SPRITES),
  ...Object.values(OBSTACLE_SPRITES),
  ...Object.values(VEHICLE_SPRITES),
  PLAYER_SPRITE,
  ...Object.values(SCREEN_IMAGES),
];
let missing = 0;
for (const f of mapped) {
  const isScreen = f === SCREEN_IMAGES.title || f === SCREEN_IMAGES.gameover;
  const url = isScreen ? screenFile(f) : spriteFile(f);
  if (!existsSync(assetUrl(url))) missing++;
}
check('all mapped sprite/screen files exist on disk', missing, 0);

// --- M8-integrate: cyan background keying (pure pixel logic) ---

import { keyCyanBackground, isCyan } from '../js/keying.js';

console.log('M8-integrate: cyan background keying (flood-fill from edges):');

// Build a synthetic RGBA buffer: w*h pixels, each [r,g,b,a].
function makeBuffer(w, h, pixelFn) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = pixelFn(i, Math.floor(i / w), i % w);
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}
const CYAN = [40, 225, 255, 255];
const GREEN = [60, 180, 60, 255];

// 1. All-cyan buffer: every pixel is background, all alpha -> 0.
{
  const buf = makeBuffer(4, 4, () => CYAN);
  const out = keyCyanBackground(4, 4, buf);
  let transparent = 0;
  for (let i = 0; i < 16; i++) if (out[i * 4 + 3] === 0) transparent++;
  check('all-cyan buffer fully keyed (16/16 alpha=0)', transparent, 16);
}

// 2. Cyan border, interior cyan kept: a 5x5 all-cyan buffer with one
//    interior cyan pixel that is NOT connected to the edge must survive.
{
  const buf = makeBuffer(5, 5, () => CYAN);
  const out = keyCyanBackground(5, 5, buf);
  const centerAlpha = out[12 * 4 + 3]; // pixel (2,2)
  const cornerAlpha = out[3]; // alpha of pixel (0,0)
  check('corner pixel keyed to alpha 0', cornerAlpha, 0);
  // The center is cyan and connected to the edge through the ring, so
  // the whole buffer keys out. (An interior cyan pixel is only kept
  // when isolated by non-cyan pixels — see test 3.)
  check('center of all-cyan 5x5 also keyed (connected)', centerAlpha, 0);
}

// 3. Interior cyan island protected by a non-cyan ring: kept.
{
  const px = (i, r, c) => {
    if (r === 2 && c === 2) return CYAN; // interior cyan pixel
    if (r === 2 || c === 2) return GREEN; // green ring isolates it
    return CYAN;
  };
  const buf = makeBuffer(5, 5, px);
  const out = keyCyanBackground(5, 5, buf);
  check('edge cyan keyed', out[3], 0);
  check('interior cyan pixel kept (alpha 255)', out[12 * 4 + 3], 255);
  check('green ring untouched (alpha 255)', out[2 * 5 * 4 + 3], 255);
}

// 4. Non-cyan corners (a full-bleed tile): nothing is keyed.
{
  const buf = makeBuffer(4, 4, () => GREEN);
  const out = keyCyanBackground(4, 4, buf);
  let anyTransparent = 0;
  for (let i = 0; i < 16; i++) if (out[i * 4 + 3] === 0) anyTransparent++;
  check('non-cyan tile left fully opaque', anyTransparent, 0);
}

// 5. Tolerance: pixels slightly off the corner color still get keyed.
{
  const px = (i, r, c) => (r === 0 || r === 3 || c === 0 || c === 3) ? [70, 200, 250, 255] : [40, 225, 255, 255];
  const buf = makeBuffer(4, 4, px);
  const out = keyCyanBackground(4, 4, buf);
  let transparent = 0;
  for (let i = 0; i < 16; i++) if (out[i * 4 + 3] === 0) transparent++;
  check('near-cyan border keyed within tolerance', transparent, 16);
}

// 6. isCyan sanity: cyan yes, green/water-ish no.
check('isCyan(40,225,255) true', isCyan(40, 225, 255), true);
check('isCyan(60,180,60) false (green)', isCyan(60, 180, 60), false);
check('isCyan(30,120,180) false (plain blue)', isCyan(30, 120, 180), false);

// --- M5.6: pre-roll conversation (dialog state machine) ---

console.log('M5.6: pre-roll dialog state machine:');

// Level-1 dialog content (from assets/dialogs/level1.txt).
check('level 1 has 2 lines', LEVEL1_LINES.length, 2);
check('line 1 speaker is Jensen', LEVEL1_LINES[0].speaker, 'Jensen');
check('line 1 has an audio clip', typeof LEVEL1_LINES[0].audio, 'string');
check('line 2 speaker is Jensen', LEVEL1_LINES[1].speaker, 'Jensen');
check('line 2 has an audio clip', typeof LEVEL1_LINES[1].audio, 'string');

// Fresh dialog: idle, no current line.
const d = createDialog(LEVEL1_LINES);
check('dialog starts idle', d.phase, 'idle');
check('no current line before begin', d.current, null);
check('advance before begin is rejected', d.advance(), false);

// begin -> line 1
const onLines = [];
const onDones = [];
const d2 = createDialog(LEVEL1_LINES, {
  onLine: (l) => onLines.push(l),
  onDone: () => onDones.push(1),
});
check('begin returns true', d2.begin(), true);
check('second begin is rejected', d2.begin(), false);
check('phase active after begin', d2.phase, 'active');
check('index 0 after begin', d2.index, 0);
check('current is line 1', d2.current, LEVEL1_LINES[0]);
check('onLine fired with line 1', onLines.length, 1);

// advance -> line 2
check('advance to line 2', d2.advance(), true);
check('index 1 after advance', d2.index, 1);
check('current is line 2', d2.current, LEVEL1_LINES[1]);
check('onLine fired for each line', onLines.length, 2);

// advance past the last line -> done
check('advance past last line', d2.advance(), true);
check('phase done after last line', d2.phase, 'done');
check('onDone fired once', onDones.length, 1);
check('advance after done is rejected', d2.advance(), false);
check('skip after done is rejected', d2.skip(), false);

// skip from an active dialog jumps straight to done
const d3 = createDialog(LEVEL1_LINES, { onDone: () => onDones.push(1) });
d3.begin();
check('skip returns true', d3.skip(), true);
check('skip fired onDone', onDones.length, 2);
check('skip twice is rejected', d3.skip(), false);

// empty dialog: begin + advance still terminates cleanly
const d4 = createDialog([]);
check('empty dialog begins', d4.begin(), true);
check('empty dialog has no current line', d4.current, null);
check('empty dialog advances to done', d4.advance(), true);
check('empty dialog is done', d4.phase, 'done');

// Text wrapping is deterministic with a fake measureText.
const fakeCtx = { measureText: (s) => ({ width: s.length * 10 }) };
const wrapped = wrapText(fakeCtx, 'aa bb cc dd', 35);
check('wrapText wraps long lines', wrapped.join('|'), 'aa|bb|cc|dd');

// Audio helpers are safe no-ops under Node (no AudioContext/speechSynthesis).
let audioThrew = false;
try {
  await playLineAudio(LEVEL1_LINES[0]); // resolves immediately under Node
  stopLineAudio();
} catch {
  audioThrew = true;
}
check('playLineAudio/stopLineAudio are safe under Node', audioThrew, false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);