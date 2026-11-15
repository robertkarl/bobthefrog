// M3: hazard + lilypad placement.
//
// - bushes on grass cells (never row 0), ≤ 15% density of grass cells
// - pylons on sidewalk cells, ≤ 15% density
// - every river gets a traversable crossing (a column where both river
//   rows are lilypads)
// - the goal river (top 2 rows) gets ≥ 3 Localhost Lilypads, each with a
//   reachable approach: a supporting lilypad in the row below, straight up
//   from the grass row under the river

import { GRID_COLS, GRID_ROWS } from '../config.js';
import { CELL } from './layout.js';

const MAX_DENSITY = 0.15;
const GOAL_LILYPADS = 3;

function makeCell(base) {
  return { base, obstacle: null };
}

/** Shuffle a copy of `cells` and return the first k (Fisher–Yates). */
function pickK(cells, k) {
  const arr = [...cells];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, k);
}

/**
 * Place bushes and pylons on the layout's grid (mutates in place).
 * Densities are hard-capped: at most floor(0.15 * eligible cells).
 */
export function placeHazards(level) {
  const { grid } = level;

  // Bushes: grass cells, excluding row 0 (Bob's safe start strip).
  const grassCells = [];
  for (let r = 1; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].base === CELL.GRASS) grassCells.push([r, c]);
    }
  }
  for (const [r, c] of pickK(grassCells, Math.floor(MAX_DENSITY * grassCells.length))) {
    grid[r][c].obstacle = 'bush';
  }

  // Pylons: sidewalk cells.
  const sidewalkCells = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].base === CELL.SIDEWALK) sidewalkCells.push([r, c]);
    }
  }
  for (const [r, c] of pickK(sidewalkCells, Math.floor(MAX_DENSITY * sidewalkCells.length))) {
    grid[r][c].obstacle = 'pylon';
  }
}

/**
 * Place lilypad crossings on the layout's grid (mutates in place).
 * Every river gets at least one column where both rows are lilypads;
 * the goal river additionally gets ≥ 3 Localhost Lilypads, each with a
 * supporting lilypad in the row below it.
 */
export function placeLilypads(level) {
  const { grid, rivers } = level;
  for (const river of rivers) {
    const [lo, hi] = river.rows;
    if (hi === GRID_ROWS - 1) {
      // Goal river: ≥ 3 Localhost Lilypads, each reachable straight from
      // the grass row below (supporting lilypad in the lower river row).
      const cols = pickK(Array.from({ length: GRID_COLS }, (_, i) => i), GOAL_LILYPADS);
      for (const c of cols) {
        grid[lo][c] = makeCell(CELL.LILYPAD);
        grid[hi][c] = makeCell(CELL.LOCALHOST_LILYPAD);
      }
    } else {
      // Plain river: one guaranteed straight crossing.
      const c = Math.floor(Math.random() * GRID_COLS);
      grid[lo][c] = makeCell(CELL.LILYPAD);
      grid[hi][c] = makeCell(CELL.LILYPAD);
    }
  }
}