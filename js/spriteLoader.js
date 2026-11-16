// M8: browser-side sprite loading. Loads every mapped PNG once at startup;
// render code asks getSprite(name) and falls back to colored rectangles
// when an image is missing (still loading or failed to load), so the game
// never breaks on a broken asset.

import {
  TILE_SPRITES,
  OBSTACLE_SPRITES,
  VEHICLE_SPRITES,
  PLAYER_SPRITE,
  SCREEN_IMAGES,
  spriteFile,
  screenFile,
} from './sprites.js';
import { keyCyanBackground } from './keying.js';

const images = new Map(); // name -> drawable (keyed canvas or Image)

// Every (name, path) pair that gets loaded; name is the sprite file name,
// matching what render code asks for (e.g. getSprite('grass.png')).
const ALL = [
  ...Object.values(TILE_SPRITES).map((f) => [f, spriteFile(f)]),
  ...Object.values(OBSTACLE_SPRITES).map((f) => [f, spriteFile(f)]),
  ...Object.values(VEHICLE_SPRITES).map((f) => [f, spriteFile(f)]),
  [PLAYER_SPRITE, spriteFile(PLAYER_SPRITE)],
  ...Object.values(SCREEN_IMAGES).map((f) => [f, screenFile(f)]),
];

/**
 * Draw the image to an offscreen canvas and key out its cyan background
 * (flood-fill from the edges; see keying.js). Returns the keyed canvas —
 * a canvas is directly drawable, so the per-frame draw is unchanged.
 * If keying throws (e.g. a tainted canvas), fall back to the raw image:
 * the game must never break on an asset.
 */
function keyImage(img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const keyed = keyCyanBackground(canvas.width, canvas.height, data.data);
    ctx.putImageData(new ImageData(keyed, canvas.width, canvas.height), 0, 0);
    return canvas;
  } catch {
    return img;
  }
}

/**
 * Load all sprites/screens. `onDone` fires once every image has settled
 * (loaded or failed). Safe to call once at boot.
 */
export function loadSprites(onDone) {
  let pending = ALL.length;
  const settle = () => {
    if (--pending === 0 && onDone) onDone();
  };
  for (const [name, path] of ALL) {
    const img = new Image();
    img.onload = () => {
      images.set(name, keyImage(img));
      settle();
    };
    img.onerror = () => settle(); // keep the rectangle fallback
    img.src = path;
  }
  if (pending === 0 && onDone) onDone();
}

/**
 * The loaded (cyan-keyed) image for `name`, or null if it is not loaded
 * (yet) or failed. Callers must treat null as "draw the rectangle
 * fallback".
 */
export function getSprite(name) {
  return images.get(name) ?? null;
}