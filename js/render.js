// Rendering: grass grid (M1) + generated level layout (M2).
// Vehicles, Bob, and overlays arrive in later milestones.

import { GRID_COLS, GRID_ROWS } from './config.js';
import { getSprite } from './spriteLoader.js';
import {
  tileSprite,
  obstacleSprite,
  vehicleSprite,
  playerSprite,
  screenImage,
} from './sprites.js';

const COLORS = {
  grassA: '#3a7d32',
  grassB: '#428739',
  asphalt: '#3d3d42',
  sidewalk: '#b8a88a',
  water: '#3a6ea8',
  lilypad: '#7fc46a',
  localhostLilypad: '#ffd23f',
  car: '#e0a33a',
  truck: '#b0653a',
  bush: '#2d5e28',
  pylon: '#8a8a8a',
  player: '#59d64e',
  gridLine: 'rgba(0, 0, 0, 0.18)',
  debugText: 'rgba(255, 255, 255, 0.55)',
  titleText: '#e8e8e8',
};

// Base-type -> fill color (grass keeps a two-tone checkerboard).
function cellColor(base, row, col) {
  switch (base) {
    case 'grass':
      return (row + col) % 2 === 0 ? COLORS.grassA : COLORS.grassB;
    case 'asphalt':
      return COLORS.asphalt;
    case 'sidewalk':
      return COLORS.sidewalk;
    case 'water':
      return COLORS.water;
    case 'lilypad':
      return COLORS.lilypad;
    case 'localhost-lilypad':
      return COLORS.localhostLilypad;
    default:
      return COLORS.grassA;
  }
}

/**
 * Draw the static grass grid. `debug` draws row/column coordinates.
 * Row 0 is the bottom row (drawn at the bottom of the canvas).
 */
export function drawGrid(ctx, cellPx, debug = true) {
  for (let row = 0; row < GRID_ROWS; row++) {
    const y = (GRID_ROWS - 1 - row) * cellPx;
    for (let col = 0; col < GRID_COLS; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.grassA : COLORS.grassB;
      ctx.fillRect(col * cellPx, y, cellPx, cellPx);
    }
  }

  drawGridLines(ctx, cellPx);
  if (debug) drawDebugLabels(ctx, cellPx);
}

// Draw bushes and pylons on top of the base cells.
function drawObstacles(ctx, cellPx, grid) {
  for (let row = 0; row < GRID_ROWS; row++) {
    const y = (GRID_ROWS - 1 - row) * cellPx;
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = grid[row][col];
      const img = getSprite(obstacleSprite(cell.obstacle));
      if (cell.obstacle === 'bush') {
        if (img) {
          ctx.drawImage(img, col * cellPx, y, cellPx, cellPx);
        } else {
          ctx.fillStyle = COLORS.bush;
          ctx.beginPath();
          ctx.arc(col * cellPx + cellPx / 2, y + cellPx / 2, cellPx * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (cell.obstacle === 'pylon') {
        if (img) {
          ctx.drawImage(img, col * cellPx, y, cellPx, cellPx);
        } else {
          ctx.fillStyle = COLORS.pylon;
          ctx.fillRect(col * cellPx + cellPx * 0.25, y + cellPx * 0.2, cellPx * 0.5, cellPx * 0.6);
        }
      }
    }
  }
}

// Draw a loaded tile sprite, falling back to a flat colored rectangle when
// the image has not loaded (asset missing / load failed).
function drawCell(ctx, x, y, cellPx, spriteName, fallbackColor) {
  const img = getSprite(spriteName);
  if (img) {
    ctx.drawImage(img, x, y, cellPx, cellPx);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(x, y, cellPx, cellPx);
  }
}

// Draw an overlay screen image fitted inside the canvas: uniform scale
// (no stretching), centered.
function drawFittedScreen(ctx, img, width, height) {
  const scale = Math.min(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  return { w, h };
}

function drawGridLines(ctx, cellPx) {
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID_COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellPx + 0.5, 0);
    ctx.lineTo(c * cellPx + 0.5, GRID_ROWS * cellPx);
    ctx.stroke();
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellPx + 0.5);
    ctx.lineTo(GRID_COLS * cellPx, r * cellPx + 0.5);
    ctx.stroke();
  }
}

function drawDebugLabels(ctx, cellPx) {
  ctx.fillStyle = COLORS.debugText;
  ctx.font = `${Math.max(8, Math.floor(cellPx * 0.3))}px monospace`;
  ctx.textBaseline = 'top';
  // Column numbers along the top.
  for (let col = 0; col < GRID_COLS; col++) {
    ctx.fillText(String(col), col * cellPx + 2, 2);
  }
  // Row numbers along the left (row 0 at the bottom).
  for (let row = 0; row < GRID_ROWS; row++) {
    const y = (GRID_ROWS - 1 - row) * cellPx;
    ctx.fillText(String(row), 2, y + 2);
  }
}

/**
 * Draw a generated level layout (M2): one colored cell per base type,
 * so a human can eyeball the band adjacency.
 */
export function drawLayout(ctx, cellPx, layout, debug = true) {
  const { grid } = layout;
  for (let row = 0; row < GRID_ROWS; row++) {
    const y = (GRID_ROWS - 1 - row) * cellPx;
    for (let col = 0; col < GRID_COLS; col++) {
      drawCell(
        ctx,
        col * cellPx,
        y,
        cellPx,
        tileSprite(grid[row][col].base),
        cellColor(grid[row][col].base, row, col),
      );
    }
  }

  drawObstacles(ctx, cellPx, grid);
  drawGridLines(ctx, cellPx);
  if (debug) drawDebugLabels(ctx, cellPx);
}

/**
 * Draw the vehicles of a traffic system (M5). Vehicles sit at fractional
 * column positions, so they are drawn at pixel positions derived from x.
 */
export function drawTraffic(ctx, cellPx, traffic) {
  for (const lane of traffic.lanes) {
    for (const v of lane.vehicles) {
      const x = v.x * cellPx;
      const y = (GRID_ROWS - 1 - lane.rows[1]) * cellPx;
      const w = v.width * cellPx;
      const h = 2 * cellPx;
      const img = getSprite(vehicleSprite(v.kind));
      if (img) {
        // Scale the sprite to the vehicle's footprint (cars/trucks are 2 rows tall).
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.fillStyle = v.kind === 'truck' ? COLORS.truck : COLORS.car;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
  }
}

/**
 * Draw Bob the Frog on his current cell.
 */
export function drawPlayer(ctx, cellPx, player) {
  const x = player.col * cellPx;
  const y = (GRID_ROWS - 1 - player.row) * cellPx;
  const img = getSprite(playerSprite());
  if (img) {
    ctx.drawImage(img, x, y, cellPx, cellPx);
  } else {
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(x + cellPx / 2, y + cellPx / 2, cellPx * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * TITLE screen overlay: title text + "Start" prompt.
 */
export function drawTitleOverlay(ctx, cellPx, width, height) {
  const img = getSprite(screenImage('TITLE'));
  if (img) {
    // Generated title screen: fitted (no stretch), centered on the canvas.
    drawFittedScreen(ctx, img, width, height);
    ctx.fillStyle = COLORS.titleText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(cellPx)}px system-ui`;
    ctx.fillText('click or press Enter to start', width / 2, height - cellPx * 1.25);
    ctx.textAlign = 'left';
    return;
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.titleText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(cellPx * 1.5)}px system-ui`;
  ctx.fillText('UNBIASED BOB CHALLENGE', width / 2, height / 2 - cellPx * 2);
  ctx.font = `${Math.floor(cellPx)}px system-ui`;
  ctx.fillText('click or press Enter to start', width / 2, height / 2);
  ctx.textAlign = 'left';
}

/**
 * GAME OVER overlay: Bob drowned or was squished.
 */
export function drawGameOverOverlay(ctx, cellPx, width, height) {
  const img = getSprite(screenImage('GAME_OVER'));
  if (img) {
    // Generated game-over screen: fitted (no stretch), centered over the level.
    drawFittedScreen(ctx, img, width, height);
    ctx.fillStyle = COLORS.titleText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(cellPx)}px system-ui`;
    ctx.fillText('R to retry - T for title', width / 2, height - cellPx * 1.25);
    ctx.textAlign = 'left';
    return;
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.titleText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(cellPx * 1.5)}px system-ui`;
  ctx.fillText('GAME OVER', width / 2, height / 2 - cellPx);
  ctx.font = `${Math.floor(cellPx)}px system-ui`;
  ctx.fillText('R to retry - T for title', width / 2, height / 2 + cellPx);
  ctx.textAlign = 'left';
}

/**
 * WIN overlay: Bob reached a Localhost Lilypad.
 */
export function drawWinOverlay(ctx, cellPx, width, height) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.titleText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(cellPx * 1.5)}px system-ui`;
  ctx.fillText('LEVEL COMPLETE', width / 2, height / 2 - cellPx);
  ctx.font = `${Math.floor(cellPx)}px system-ui`;
  ctx.fillText('Enter for next level - T for title', width / 2, height / 2 + cellPx);
  ctx.textAlign = 'left';
}