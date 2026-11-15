// M3: reachability validation.
//
// Multi-source BFS from the entire bottom row over traversable cells
// (grass / sidewalk / asphalt / lilypad / localhost-lilypad; NOT water,
// bush, or pylon). Every Localhost Lilypad must be reachable.
//
// generateLevel() (index.js) uses validateLevel in a regenerate loop with
// a forced-fix fallback, so generation never hangs.

import { GRID_COLS, GRID_ROWS } from '../config.js';
import { CELL, validateLayout } from './layout.js';

const WALKABLE = new Set([
  CELL.GRASS,
  CELL.SIDEWALK,
  CELL.ASPHALT,
  CELL.LILYPAD,
  CELL.LOCALHOST_LILYPAD,
]);

/** A cell Bob can enter (ignoring vehicles). */
export function isTraversable(cell) {
  return !!cell && WALKABLE.has(cell.base) && cell.obstacle === null;
}

/** All Localhost Lilypad cells, as [row, col] pairs. */
export function findGoals(grid) {
  const goals = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].base === CELL.LOCALHOST_LILYPAD) goals.push([r, c]);
    }
  }
  return goals;
}

/**
 * Validate a full level: layout constraints (validateLayout) + at least
 * three Localhost Lilypads + BFS reachability of every Localhost Lilypad
 * from the bottom row.
 *
 * Returns { ok, errors, reachable }:
 *   ok        true iff the level is well-formed and fully solvable
 *   errors    list of violation strings
 *   reachable the goal cells the BFS reached
 */
export function validateLevel(level) {
  const { grid } = level;
  const layoutErrors = validateLayout(level);
  if (layoutErrors.length > 0) {
    return { ok: false, errors: layoutErrors, reachable: [] };
  }

  const goals = findGoals(grid);
  if (goals.length < 3) {
    return {
      ok: false,
      errors: [`goal river has ${goals.length} localhost lilypads, need >= 3`],
      reachable: [],
    };
  }

  // Multi-source BFS from every traversable cell in the bottom row.
  const visited = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  const queue = [];
  for (let c = 0; c < GRID_COLS; c++) {
    if (isTraversable(grid[0][c])) {
      visited[0][c] = true;
      queue.push([0, c]);
    }
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (visited[nr][nc] || !isTraversable(grid[nr][nc])) continue;
      visited[nr][nc] = true;
      queue.push([nr, nc]);
    }
  }

  const reachable = goals.filter(([r, c]) => visited[r][c]);
  const errors = goals
    .filter(([r, c]) => !visited[r][c])
    .map(([r, c]) => `localhost lilypad (${r},${c}) unreachable from the bottom row`);

  return { ok: errors.length === 0, errors, reachable };
}