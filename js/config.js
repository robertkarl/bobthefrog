// Tunables: grid size, cell sizing, timing.

// Logical grid: 18 wide x 26 tall (spec requires >= 16 x 25).
// Row 0 is the bottom row.
export const GRID_COLS = 18;
export const GRID_ROWS = 26;

// Base cell size in px; scaled down if the canvas is smaller.
export const BASE_CELL_PX = 32;
export const MAX_CELL_PX = 48;

// Clamp per-frame delta so a backgrounded tab doesn't teleport the world.
export const DT_CLAMP_S = 0.1;

// Cell size (px) for a given canvas size: largest square cell that fits
// the full grid in both dimensions, capped at MAX_CELL_PX.
export function cellSizePx(canvasWidth, canvasHeight) {
  const byWidth = Math.floor(canvasWidth / GRID_COLS);
  const byHeight = Math.floor(canvasHeight / GRID_ROWS);
  return Math.max(1, Math.min(byWidth, byHeight, MAX_CELL_PX));
}

// Canvas pixel size for a given cell size.
export function canvasSizeFor(cellPx) {
  return {
    width: cellPx * GRID_COLS,
    height: cellPx * GRID_ROWS,
  };
}