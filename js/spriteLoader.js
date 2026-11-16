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

const images = new Map(); // name -> HTMLImageElement

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
      images.set(name, img);
      settle();
    };
    img.onerror = () => settle(); // keep the rectangle fallback
    img.src = path;
  }
  if (pending === 0 && onDone) onDone();
}

/**
 * The loaded Image for `name`, or null if it is not loaded (yet) or
 * failed. Callers must treat null as "draw the rectangle fallback".
 */
export function getSprite(name) {
  return images.get(name) ?? null;
}