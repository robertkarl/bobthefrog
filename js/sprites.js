// M8: central sprite mapping — element name -> asset file.
// Pure (no DOM), so the mapping is unit-testable under Node.
//
// Files live under assets/sprites/ (64px tiles; truck is 128x64) and
// assets/screens/ (1024px and 512px overlay screens). See assets/MANIFEST.md.

export const SPRITE_DIR = 'assets/sprites/';
export const SCREEN_DIR = 'assets/screens/';

// Base cell type -> tile sprite (drawn one per cell).
export const TILE_SPRITES = {
  asphalt: 'asphalt.png',
  grass: 'grass.png',
  sidewalk: 'sidewalk.png',
  water: 'water.png',
  lilypad: 'lilypad.png',
  'localhost-lilypad': 'localhost_lilypad.png',
};

// Obstacle -> sprite (drawn on top of the base cell).
export const OBSTACLE_SPRITES = {
  bush: 'bush.png',
  pylon: 'pylon.png',
};

// Vehicle kind -> sprite. Sprites are stretched to the vehicle footprint
// (car 2x2 cells from a 64x64 sprite; truck 4x2 cells from a 128x64 sprite,
// so both keep their aspect ratio).
export const VEHICLE_SPRITES = {
  car: 'car.png',
  truck: 'truck.png',
};

// Bob's sprite.
export const PLAYER_SPRITE = 'bob.png';

// Overlay screens. The 512px variants are used: they fit the 576x832
// canvas without upscaling, and are lighter to load.
export const SCREEN_IMAGES = {
  title: 'title_512.png',
  gameover: 'gameover_512.png',
};

/** Sprite file for a cell base type (null for unknown bases). */
export function tileSprite(base) {
  return TILE_SPRITES[base] ?? null;
}

/** Sprite file for an obstacle (null for unknown obstacles). */
export function obstacleSprite(name) {
  return OBSTACLE_SPRITES[name] ?? null;
}

/** Sprite file for a vehicle kind (null for unknown kinds). */
export function vehicleSprite(kind) {
  return VEHICLE_SPRITES[kind] ?? null;
}

/** Bob's sprite file. */
export function playerSprite() {
  return PLAYER_SPRITE;
}

/** Screen image for an overlay state ('TITLE' / 'GAME_OVER'); null otherwise. */
export function screenImage(state) {
  if (state === 'TITLE') return SCREEN_IMAGES.title;
  if (state === 'GAME_OVER') return SCREEN_IMAGES.gameover;
  return null;
}

/** Full relative path for a sprite file. */
export function spriteFile(name) {
  return SPRITE_DIR + name;
}

/** Full relative path for a screen image. */
export function screenFile(name) {
  return SCREEN_DIR + name;
}