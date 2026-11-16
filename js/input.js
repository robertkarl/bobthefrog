// Input: start trigger (M1) + arrow-key hopping (M4).

const KEY_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Wire up the TITLE-screen start trigger on a canvas (click) and window
 * (Enter key). Returns a cleanup function that detaches the listeners.
 */
export function attachStartHandler(canvas, windowRef, onStart) {
  const onClick = () => onStart();
  const onKey = (e) => {
    if (e.key === 'Enter') onStart(e); // pass the event (M5.6 dialog guard)
  };
  canvas.addEventListener('click', onClick);
  windowRef.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('click', onClick);
    windowRef.removeEventListener('keydown', onKey);
  };
}

/**
 * Wire up arrow-key hopping. One hop per keypress (key auto-repeat is
 * ignored). Calls onHop('up' | 'down' | 'left' | 'right'). Returns a
 * cleanup function that detaches the listener.
 */
export function attachHopHandler(windowRef, onHop) {
  const onKey = (e) => {
    if (e.repeat) return; // one hop per physical press
    const dir = KEY_DIRS[e.key];
    if (dir) onHop(dir);
  };
  windowRef.addEventListener('keydown', onKey);
  return () => windowRef.removeEventListener('keydown', onKey);
}