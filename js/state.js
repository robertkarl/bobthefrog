// Pure game state machine. No DOM, no timers — testable under Node.

export const STATE = Object.freeze({
  TITLE: 'TITLE',
  PLAYING: 'PLAYING',
  GAME_OVER: 'GAME_OVER',
  WIN: 'WIN',
});

export const EVENT = Object.freeze({
  START: 'START',
  DIE: 'DIE',
  WIN: 'WIN',
  RETRY: 'RETRY',
  NEXT: 'NEXT',
  TITLE: 'TITLE',
});

// transitions[state][event] -> next state
const TRANSITIONS = {
  [STATE.TITLE]: {
    [EVENT.START]: STATE.PLAYING,
  },
  [STATE.PLAYING]: {
    [EVENT.DIE]: STATE.GAME_OVER,
    [EVENT.WIN]: STATE.WIN,
  },
  [STATE.GAME_OVER]: {
    [EVENT.RETRY]: STATE.PLAYING,
    [EVENT.TITLE]: STATE.TITLE,
  },
  [STATE.WIN]: {
    [EVENT.NEXT]: STATE.PLAYING,
    [EVENT.TITLE]: STATE.TITLE,
  },
};

/**
 * Returns the next state for (state, event), or null if the transition is
 * invalid (unknown state, unknown event, or no transition defined).
 */
export function nextState(state, event) {
  const table = TRANSITIONS[state];
  if (!table) return null;
  return table[event] ?? null;
}