// Bob the Frog: position, discrete hops, bounds, drown/win checks.
// Pure logic — testable under Node (no DOM).
//
// Rules (spec):
//   - arrow keys hop Bob exactly one cell, orthogonally (no diagonals)
//   - Bob cannot leave the playable area (out-of-bounds hops are ignored)
//   - bushes and pylons cannot be entered (blocked, no crash)
//   - water = instant death (drown)
//   - stepping on a Localhost Lilypad wins the game

import { GRID_COLS, GRID_ROWS } from './config.js';
import { CELL } from './levelgen/layout.js';

export const DIR = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
};

// Row 0 is the bottom row; "up" (toward the goal river) increases the row.
const DELTAS = {
  up: [1, 0],
  down: [-1, 0],
  left: [0, -1],
  right: [0, 1],
};

/**
 * Create Bob at a random cell in the bottom row (row 0, always grass).
 * Returns { row, col, facing }.
 */
export function createPlayer(grid) {
  void grid; // grid is always valid at row 0; kept for API symmetry
  return {
    row: 0,
    col: Math.floor(Math.random() * GRID_COLS),
    facing: null,
  };
}

/**
 * Hop Bob one cell in `dir` ('up' | 'down' | 'left' | 'right').
 * Mutates the player on a successful hop.
 *
 * Returns { moved, result } where result is one of:
 *   'moved'    — Bob moved one cell to a safe cell
 *   'blocked'  — out-of-bounds or obstacle (bush/pylon); Bob did not move
 *   'drowned'  — Bob moved into water and dies
 *   'win'      — Bob moved onto a Localhost Lilypad; level complete
 */
export function hop(player, dir, grid) {
  const delta = DELTAS[dir];
  if (!delta) return { moved: false, result: 'blocked' };

  const nr = player.row + delta[0];
  const nc = player.col + delta[1];

  // Out-of-bounds hops are simply ignored.
  if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) {
    return { moved: false, result: 'blocked' };
  }

  const cell = grid[nr][nc];
  // Bushes and pylons are solid: Bob cannot enter them.
  if (cell.obstacle !== null) {
    return { moved: false, result: 'blocked' };
  }

  player.row = nr;
  player.col = nc;
  player.facing = dir;

  if (cell.base === CELL.WATER) return { moved: true, result: 'drowned' };
  if (cell.base === CELL.LOCALHOST_LILYPAD) return { moved: true, result: 'win' };
  return { moved: true, result: 'moved' };
}