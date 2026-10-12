/**
 * Pure presence state machine — unit-testable (no DOM).
 * isOpen true  → mounted, phase enter
 * isOpen false → phase exit → (after duration) unmounted
 */

export const PRESENCE_PHASE = {
  ENTER: 'enter',
  EXIT: 'exit',
};

/**
 * @param {{ mounted: boolean, phase: 'enter'|'exit'|null }} state
 * @param {{ type: 'OPEN' } | { type: 'CLOSE' } | { type: 'EXIT_DONE' }} action
 */
export function presenceReducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return { mounted: true, phase: PRESENCE_PHASE.ENTER };
    case 'CLOSE':
      if (!state.mounted) return state;
      return { mounted: true, phase: PRESENCE_PHASE.EXIT };
    case 'EXIT_DONE':
      if (state.phase !== PRESENCE_PHASE.EXIT) return state;
      return { mounted: false, phase: null };
    default:
      return state;
  }
}

export function initialPresenceState(isOpen) {
  return isOpen
    ? { mounted: true, phase: PRESENCE_PHASE.ENTER }
    : { mounted: false, phase: null };
}
