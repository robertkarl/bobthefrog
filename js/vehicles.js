// M5: traffic — per-lane spawning, vehicle movement, collision.
//
// Model:
//   lane:    { rows: [r, r+1], dir: 'left' | 'right' }
//   vehicle: { lane (index), x (float, leading edge in columns), width, kind }
//
// A vehicle occupies the interval [x, x + width) in columns across the lane's
// two rows. Vehicles move continuously at a constant speed (cells/sec) in
// the lane's direction and are removed once fully off-screen.
//
// Collision (REVIEW.md fix): interval overlap, NOT a floor-based column range.
// Bob at column c collides with a vehicle iff:
//     v.x < c + 1 && v.x + width > c
// A floor-based range (c ∈ [floor(x), floor(x) + width - 1]) drops the trailing
// column on fractional x and misses real hits — do NOT use it.

export const SPAWN_MIN_S = 2; // spec: never more often than 1 per 2s per lane
export const SPAWN_MAX_S = 5; // plan: spawn interval drawn from [2s, ~5s]
export const CAR_WIDTH = 2; // car: 2 columns x 2 rows
export const TRUCK_WIDTH = 4; // truck: 4 columns x 2 rows
export const MIN_GAP = 1; // minimum clearance between vehicles in a lane (cells)

// Constant speed per lane: base 4 cells/s, +1 per completed level, cap 8.
export function speedFor(completions) {
  return Math.min(4 + completions, 8);
}

/**
 * Create a traffic system for a level's lanes.
 * `rand` is an injectable RNG (Math.random by default) so tests can be
 * deterministic. Each lane's first spawn is delayed by rand() * SPAWN_MIN_S;
 * all subsequent spawns are at least SPAWN_MIN_S apart.
 */
export function createTraffic(lanes, speed, cols, rand = Math.random) {
  const laneStates = lanes.map((lane, i) => ({
    index: i,
    rows: lane.rows,
    dir: lane.dir,
    vehicles: [],
    nextSpawnIn: rand() * SPAWN_MIN_S,
  }));
  return { lanes: laneStates, speed, cols, rand };
}

/**
 * Advance the simulation by `dt` seconds: move vehicles, remove those fully
 * off-screen, and spawn when a lane's timer is due (at most 1 per 2 s per
 * lane, never on top of an existing vehicle).
 *
 * Returns the list of vehicles spawned this step: [{ lane, x, width, kind }].
 */
export function updateTraffic(traffic, dt) {
  const spawned = [];
  for (const lane of traffic.lanes) {
    const sign = lane.dir === 'left' ? -1 : 1;
    for (const v of lane.vehicles) v.x += sign * traffic.speed * dt;

    // A vehicle is fully off-screen once its trailing edge passed the edge it
    // entered from (left lanes exit on the left, right lanes on the right).
    lane.vehicles = lane.vehicles.filter((v) =>
      lane.dir === 'left' ? v.x + v.width >= 0 : v.x < traffic.cols
    );

    lane.nextSpawnIn -= dt;
    if (lane.nextSpawnIn <= 0) {
      if (canSpawn(lane, traffic.cols)) {
        const v = makeVehicle(lane, traffic.cols, traffic.rand);
        lane.vehicles.push(v);
        spawned.push({ lane: lane.index, x: v.x, width: v.width, kind: v.kind });
      }
      lane.nextSpawnIn =
        SPAWN_MIN_S + traffic.rand() * (SPAWN_MAX_S - SPAWN_MIN_S);
    }
  }
  return spawned;
}

/**
 * A vehicle occupies cell column `c` iff the intervals overlap:
 * vehicle [x, x + width) vs Bob's cell [c, c + 1).
 */
export function vehicleOverlapsCell(v, col) {
  return v.x < col + 1 && v.x + v.width > col;
}

/**
 * Does any vehicle currently overlap Bob's cell? (Checked every frame and
 * after every Bob hop — collision is bidirectional.)
 */
export function bobInDanger(traffic, player) {
  for (const lane of traffic.lanes) {
    if (player.row < lane.rows[0] || player.row > lane.rows[1]) continue;
    for (const v of lane.vehicles) {
      if (vehicleOverlapsCell(v, player.col)) return true;
    }
  }
  return false;
}

// --- internals ---

function makeVehicle(lane, cols, rand) {
  const kind = rand() < 0.5 ? 'car' : 'truck';
  const width = kind === 'truck' ? TRUCK_WIDTH : CAR_WIDTH;
  // Spawn fully outside the playable area: 'left' lanes enter from the
  // right edge (leading edge at the right edge), 'right' lanes from the
  // left edge (trailing edge at the left edge). Spec: starting position is
  // fully outside the playable area.
  const x = lane.dir === 'left' ? cols : -width;
  return { lane: lane.index, x, width, kind };
}

/**
 * The new vehicle (fully off-screen at the entry edge) must not overlap any
 * existing vehicle in the lane: keep at least MIN_GAP of clearance.
 */
function canSpawn(lane, cols) {
  for (const v of lane.vehicles) {
    // Left lanes: new vehicle's leading edge is at `cols`; the gap to the
    // nearest existing vehicle's trailing edge is cols - (v.x + v.width).
    // Right lanes: new vehicle's trailing edge is at 0; the gap to the
    // nearest existing vehicle's leading edge is v.x.
    const gap = lane.dir === 'left' ? cols - (v.x + v.width) : v.x;
    if (gap < MIN_GAP) return false;
  }
  return true;
}