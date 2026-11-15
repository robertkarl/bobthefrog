// M2: vertical band layout generation + adjacency validation.
//
// Grid model (PLAN.md §2): grid[row][col] = { base, obstacle }.
// Row 0 is the bottom row. In M2 only base cell types are used;
// obstacles (bush/pylon) and lilypads arrive in M3.

import { GRID_COLS, GRID_ROWS } from '../config.js';

export const CELL = {
  GRASS: 'grass',
  ASPHALT: 'asphalt',
  SIDEWALK: 'sidewalk',
  WATER: 'water',
  LILYPAD: 'lilypad',
  LOCALHOST_LILYPAD: 'localhost-lilypad',
};

export const DIR = { LEFT: 'left', RIGHT: 'right' };

const BASE_TYPES = new Set(Object.values(CELL));

function makeCell(base) {
  return { base, obstacle: null };
}

/**
 * Generate a vertical band layout, bottom -> top:
 *   row 0        grass (always safe)
 *   top 2 rows   goal river (water)
 *   middle       traffic lanes (single or adjacent pair, optional sidewalks)
 *                and rivers, separated by grass.
 *
 * Adjacency constraints enforced by construction (and re-checked by
 * validateLayout):
 *   - rivers border only grass or the top edge
 *   - sidewalks border a traffic lane on one side and grass on the other
 *
 * Returns { grid, lanes, rivers }:
 *   grid    grid[row][col] = { base, obstacle }
 *   lanes   [{ rows: [r, r+1], dir }]  (dir: 'left' | 'right')
 *   rivers  [{ rows: [r, r+1] }]  (includes the goal river)
 */
export function generateLayout() {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    grid.push(Array.from({ length: GRID_COLS }, () => makeCell(CELL.GRASS)));
  }

  // Goal river: top 2 rows.
  const goalRows = [GRID_ROWS - 2, GRID_ROWS - 1];
  for (const r of goalRows) {
    for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell(CELL.WATER);
  }
  const rivers = [{ rows: goalRows }];
  const lanes = [];

  // Middle rows are 1..GRID_ROWS-3. Row GRID_ROWS-3 must stay grass so the
  // goal river borders only grass.
  const topLimit = GRID_ROWS - 3;
  let cursor = 1;

  while (cursor <= topLimit) {
    // Pick a feature: lane pair (4 rows), single lane (2), or river (2).
    let kind;
    const roll = Math.random();
    if (roll < 0.4) kind = 'pair';
    else if (roll < 0.7) kind = 'lane';
    else kind = 'river';

    // Optional sidewalks on the outer edge(s) of a traffic feature.
    // Never between two lanes; always grass on the far side.
    let swBelow = kind !== 'river' && Math.random() < 0.35;
    let swAbove = kind !== 'river' && Math.random() < 0.35;
    let h = (kind === 'pair' ? 4 : 2) + (swBelow ? 1 : 0) + (swAbove ? 1 : 0);

    // The feature must leave row topLimit grass. Shrink until it fits.
    while (cursor + h - 1 > topLimit - 1) {
      if (swAbove) {
        swAbove = false;
        h--;
      } else if (swBelow) {
        swBelow = false;
        h--;
      } else if (kind === 'pair') {
        kind = 'lane';
        h = 2;
      } else {
        break; // doesn't fit at all; the rest stays grass
      }
    }
    if (cursor + h - 1 > topLimit - 1) break;

    const rows = [];
    for (let r = cursor; r < cursor + h; r++) rows.push(r);

    if (kind === 'river') {
      for (const r of rows) {
        for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell(CELL.WATER);
      }
      rivers.push({ rows });
    } else {
      // Lane rows: the block minus any sidewalk rows at its edges.
      const laneRows = rows.slice(swBelow ? 1 : 0, rows.length - (swAbove ? 1 : 0));
      for (const r of laneRows)
        for (let c = 0; c < GRID_COLS; c++) grid[r][c] = makeCell(CELL.ASPHALT);
      if (swBelow)
        for (let c = 0; c < GRID_COLS; c++) grid[rows[0]][c] = makeCell(CELL.SIDEWALK);
      if (swAbove)
        for (let c = 0; c < GRID_COLS; c++)
          grid[rows[rows.length - 1]][c] = makeCell(CELL.SIDEWALK);

      const dirA = Math.random() < 0.5 ? DIR.LEFT : DIR.RIGHT;
      lanes.push({ rows: [laneRows[0], laneRows[1]], dir: dirA });
      if (kind === 'pair') {
        const dirB = dirA === DIR.LEFT ? DIR.RIGHT : DIR.LEFT;
        lanes.push({ rows: [laneRows[2], laneRows[3]], dir: dirB });
      }
    }

    // One grass row after every feature (separator; also the grass side
    // for any sidewalk at the block's top edge).
    cursor += h + 1;
  }

  const level = { grid, lanes, rivers };
  const errors = validateLayout(level);
  if (errors.length > 0) {
    throw new Error('layout failed validation: ' + errors.join('; '));
  }
  return level;
}

/**
 * Check all M2 adjacency constraints. Returns a list of violation
 * strings; empty means the layout is valid.
 */
export function validateLayout({ grid, lanes, rivers }) {
  const errors = [];

  // 1. Every cell has exactly one base type (no obstacles in M2).
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r] && grid[r][c];
      if (!cell || !BASE_TYPES.has(cell.base)) {
        errors.push(`(${r},${c}) has no valid base type`);
      } else if (cell.obstacle !== null) {
        errors.push(`(${r},${c}) has an obstacle in an M2 layout`);
      }
    }
  }

  // Row base type (rows are full-width and uniform by construction).
  const rowBase = (r) => grid[r][0].base;

  // 2. Row 0 is grass; top 2 rows are water.
  if (rowBase(0) !== CELL.GRASS) errors.push('row 0 is not grass');
  if (rowBase(GRID_ROWS - 2) !== CELL.WATER) errors.push('row ' + (GRID_ROWS - 2) + ' is not water');
  if (rowBase(GRID_ROWS - 1) !== CELL.WATER) errors.push('row ' + (GRID_ROWS - 1) + ' is not water');

  // 3. Lanes: exactly 2 rows tall, full width, with a direction.
  const laneRows = new Set();
  for (const lane of lanes) {
    if (!Array.isArray(lane.rows) || lane.rows.length !== 2) {
      errors.push('lane rows ' + JSON.stringify(lane.rows) + ' is not exactly 2 rows tall');
      continue;
    }
    if (lane.dir !== DIR.LEFT && lane.dir !== DIR.RIGHT) {
      errors.push('lane rows ' + JSON.stringify(lane.rows) + ' has no valid direction');
    }
    for (const r of lane.rows) {
      if (rowBase(r) !== CELL.ASPHALT) errors.push('lane row ' + r + ' is not asphalt');
      laneRows.add(r);
    }
  }
  // No stray asphalt outside declared lanes.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) === CELL.ASPHALT && !laneRows.has(r)) {
      errors.push('row ' + r + ' is asphalt but not a declared lane');
    }
  }

  // 4. Directly adjacent lanes (a pair) have opposite directions.
  const sorted = [...lanes].sort((a, b) => a.rows[0] - b.rows[0]);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.rows[0] === prev.rows[1] + 1 && prev.dir === cur.dir) {
      errors.push('adjacent lanes rows ' + JSON.stringify(prev.rows) + ' and ' + JSON.stringify(cur.rows) + ' have the same direction');
    }
  }

  // 5. Rivers: 2 rows tall, all water; no water outside declared rivers.
  const riverRows = new Set();
  for (const river of rivers) {
    if (!Array.isArray(river.rows) || river.rows.length !== 2) {
      errors.push('river rows ' + JSON.stringify(river.rows) + ' is not exactly 2 rows tall');
      continue;
    }
    for (const r of river.rows) {
      if (rowBase(r) !== CELL.WATER) errors.push('river row ' + r + ' is not water');
      riverRows.add(r);
    }
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) === CELL.WATER && !riverRows.has(r)) {
      errors.push('row ' + r + ' is water but not a declared river');
    }
  }

  // 6. Rivers border only grass or the top edge (check each river's outer rows).
  for (const river of rivers) {
    const lo = river.rows[0];
    const hi = river.rows[1];
    if (lo - 1 >= 0 && rowBase(lo - 1) !== CELL.GRASS) {
      errors.push('river rows ' + JSON.stringify(river.rows) + ' border non-grass row ' + (lo - 1) + ' below');
    }
    if (hi + 1 < GRID_ROWS && rowBase(hi + 1) !== CELL.GRASS) {
      errors.push('river rows ' + JSON.stringify(river.rows) + ' border non-grass row ' + (hi + 1) + ' above');
    }
  }

  // 7. Sidewalk rows border a lane on exactly one side and grass on the other.
  for (let r = 0; r < GRID_ROWS; r++) {
    if (rowBase(r) !== CELL.SIDEWALK) continue;
    const above = r + 1 < GRID_ROWS ? rowBase(r + 1) : null; // top edge
    const below = r - 1 >= 0 ? rowBase(r - 1) : null; // bottom edge
    const aboveLane = above === CELL.ASPHALT && laneRows.has(r + 1);
    const belowLane = below === CELL.ASPHALT && laneRows.has(r - 1);
    if (aboveLane + belowLane !== 1) {
      errors.push('sidewalk row ' + r + ' does not border a traffic lane on exactly one side');
    }
    if (aboveLane && below !== CELL.GRASS) {
      errors.push('sidewalk row ' + r + ' does not border grass on its other side');
    }
    if (belowLane && above !== CELL.GRASS) {
      errors.push('sidewalk row ' + r + ' does not border grass on its other side');
    }
  }

  // 8. Everything else is grass.
  for (let r = 0; r < GRID_ROWS; r++) {
    const b = rowBase(r);
    const isFeature = laneRows.has(r) || riverRows.has(r) || b === CELL.SIDEWALK;
    if (!isFeature && b !== CELL.GRASS) {
      errors.push('row ' + r + ' is ' + b + ' but not a lane/river/sidewalk');
    }
  }

  return errors;
}