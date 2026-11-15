// Input. M1: only the "start" trigger. Arrow-key hopping arrives in M4.

/**
 * Wire up the TITLE-screen start trigger on a canvas (click) and window
 * (Enter key). Returns a cleanup function that detaches the listeners.
 */
export function attachStartHandler(canvas, windowRef, onStart) {
  const onClick = () => onStart();
  const onKey = (e) => {
    if (e.key === 'Enter') onStart();
  };
  canvas.addEventListener('click', onClick);
  windowRef.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('click', onClick);
    windowRef.removeEventListener('keydown', onKey);
  };
}