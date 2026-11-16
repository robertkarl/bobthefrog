// Pure pixel keying for the cyan-background sprites (M8).
//
// The 64px sprites in assets/sprites/ were generated on a solid cyan
// background (see assets/MANIFEST.md). Instead of re-exporting the assets,
// the background is keyed out at load time: flood-fill from the image
// edges over pixels matching the cyan corner color within a tolerance,
// and set their alpha to 0. Flood-filling (rather than a global color
// threshold) means interior pixels that happen to be cyan-ish are left
// untouched — only the connected background region is removed.
//
// Pure JS over a Uint8ClampedArray (RGBA), testable in Node without a
// canvas.

const CHANNELS = 4;

/** True for pixels in the cyan family (the generated background color). */
export function isCyan(r, g, b) {
  return r < 120 && g >= 150 && b >= 220;
}

/**
 * Key out the cyan background of a sprite.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray} pixels RGBA pixel data, width*height*4 entries.
 * @param {number} [tolerance] per-channel tolerance for matching the
 *   reference corner color (default 40).
 * @returns {Uint8ClampedArray} a new pixel buffer; background pixels have
 *   alpha 0. If the image has no cyan corners (e.g. a full-bleed tile or
 *   screen image), the input is returned unchanged.
 */
export function keyCyanBackground(width, height, pixels, tolerance = 40) {
  if (width <= 0 || height <= 0 || pixels.length < width * height * CHANNELS) {
    return pixels;
  }

  // Reference color = average of the corners that look cyan. If fewer than
  // two corners are cyan, this is not a cyan-background asset: leave it.
  const corners = [
    0,
    (width - 1) * CHANNELS,
    (height - 1) * width * CHANNELS,
    (height - 1) * width * CHANNELS + (width - 1) * CHANNELS,
  ];
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (const i of corners) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (isCyan(r, g, b)) {
      rs += r;
      gs += g;
      bs += b;
      n++;
    }
  }
  if (n < 2) return pixels;
  const ref = [rs / n, gs / n, bs / n];

  const matches = (i) =>
    Math.abs(pixels[i] - ref[0]) <= tolerance &&
    Math.abs(pixels[i + 1] - ref[1]) <= tolerance &&
    Math.abs(pixels[i + 2] - ref[2]) <= tolerance;

  // Flood-fill (stack-based DFS) from every matching edge pixel.
  const visited = new Uint8Array(width * height);
  const stack = [];
  const tryPush = (idx) => {
    if (visited[idx]) return;
    if (matches(idx * CHANNELS)) {
      visited[idx] = 1;
      stack.push(idx);
    }
  };
  for (let x = 0; x < width; x++) {
    tryPush(x); // top edge
    tryPush((height - 1) * width + x); // bottom edge
  }
  for (let y = 0; y < height; y++) {
    tryPush(y * width); // left edge
    tryPush(y * width + width - 1); // right edge
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x + 1 < width) tryPush(idx + 1);
    if (x > 0) tryPush(idx - 1);
    if (y + 1 < height) tryPush(idx + width);
    if (y > 0) tryPush(idx - width);
  }

  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i < width * height; i++) {
    if (visited[i]) out[i * CHANNELS + 3] = 0;
  }
  return out;
}