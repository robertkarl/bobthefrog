// M3: generateLevel() — layout + lilypads + hazards + BFS validation.
// Returns a guaranteed-solvable level:
//   { grid, lanes, rivers, goals, difficulty, speed }

import { generateLayout } from './layout.js';
import { placeHazards, placeLilypads } from './hazards.js';
import { findGoals, validateLevel } from './validate.js';

const MAX_RETRIES = 5;

function makeLevel(layout, difficulty) {
  return {
    grid: layout.grid,
    lanes: layout.lanes,
    rivers: layout.rivers,
    goals: findGoals(layout.grid),
    difficulty,
    speed: Math.min(4 + difficulty, 8),
  };
}

/**
 * Generate a level: layout -> lilypads -> hazards -> validate.
 * Regenerates on failure (bounded retries). The final fallback strips all
 * obstacles, which is provably solvable: every river has a guaranteed
 * lilypad crossing and grass rows are otherwise unobstructed, so a
 * hazard-free layout always has a static path to every goal.
 */
export function generateLevel(difficulty = 0) {
  let last = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const layout = generateLayout();
    placeLilypads(layout);
    placeHazards(layout);
    const result = validateLevel(layout);
    if (result.ok) return makeLevel(layout, difficulty);
    last = layout;
  }

  // Forced-fix fallback: hazards are the only things that can block the
  // static path, so clearing every obstacle guarantees a solvable level.
  const layout = last ?? generateLayout();
  for (let r = 0; r < layout.grid.length; r++) {
    for (let c = 0; c < layout.grid[r].length; c++) {
      layout.grid[r][c].obstacle = null;
    }
  }
  const result = validateLevel(layout);
  if (!result.ok) {
    throw new Error('level generation failed: ' + result.errors.join('; '));
  }
  return makeLevel(layout, difficulty);
}