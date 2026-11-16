// M5.6: canvas rendering of the pre-roll conversation.
//
// Simple pixel-art conversation style (Stardew-conversation reference):
// a large text box near the bottom of the screen, a small pixel
// headshot panel for the speaker, and large wrapped text.

/**
 * Wrap text into lines that fit `maxWidth` px (word-based).
 */
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Tiny pixel-art headshot: an 8x8 grid of px-sized pixels.
function drawPixelFace(ctx, x, y, px, mood) {
  const P = (color, col, row) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + col * px, y + row * px, px, px);
  };
  const hair = '#4a3524';
  const skin = '#e8b98a';
  // hair band
  for (let c = 1; c <= 6; c++) {
    P(hair, c, 0);
    P(hair, c, 1);
  }
  // face
  for (let c = 1; c <= 6; c++) {
    for (let r = 2; r <= 6; r++) P(skin, c, r);
  }
  // eyes
  P('#222222', 2, 3);
  P('#222222', 5, 3);
  // mouth: wide smile vs. short serious line
  if (mood === 'smiling') {
    P('#8a4a3a', 2, 5);
    P('#8a4a3a', 3, 5);
    P('#8a4a3a', 4, 5);
    P('#8a4a3a', 5, 5);
  } else {
    P('#8a4a3a', 3, 5);
    P('#8a4a3a', 4, 5);
  }
}

/**
 * Draw the pre-roll dialog overlay: dimmed backdrop + a large text box
 * with a speaker headshot panel (name + pixel face) and the line text.
 * `line` is one of LEVEL1_LINES ({ speaker, mood, text }).
 */
export function drawDialog(ctx, cellPx, width, height, line) {
  // Dim the backdrop.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, width, height);

  // Text box (Stardew-style: wide box near the bottom).
  const margin = cellPx;
  const boxW = width - margin * 2;
  const boxH = cellPx * 7;
  const boxX = margin;
  const boxY = height - boxH - cellPx * 2;

  ctx.fillStyle = '#f0e6d2';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#3a2e22';
  ctx.lineWidth = 4;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  // Headshot panel: pixel face + speaker name, top-left inside the box.
  const panel = cellPx * 4;
  const px = (panel - 20) / 8; // pixel size for the 8x8 face
  const panelX = boxX + 14;
  const panelY = boxY + 14;
  ctx.fillStyle = '#d9c9a8';
  ctx.fillRect(panelX, panelY, panel, panel);
  drawPixelFace(ctx, panelX + 10, panelY + 10, px, line.mood);
  ctx.fillStyle = '#3a2e22';
  ctx.font = `bold ${Math.floor(cellPx * 0.7)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(line.speaker, panelX + panel / 2, panelY + panel - cellPx * 0.9);

  // Line text: large, wrapped, to the right of the headshot.
  const textX = panelX + panel + 14;
  const textMaxW = boxX + boxW - 14 - textX;
  const fontSize = Math.floor(cellPx * 0.75);
  ctx.font = `${fontSize}px system-ui`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#222222';
  const lines = wrapText(ctx, line.text, textMaxW);
  const lineHeight = fontSize * 1.25;
  // Vertically center the text block against the headshot panel.
  const startY = panelY + (panel - lineHeight * lines.length) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, startY + i * lineHeight);
  }
}