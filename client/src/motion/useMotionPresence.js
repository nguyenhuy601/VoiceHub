import { useEffect, useReducer, useRef } from 'react';
import { VH_MOTION_OVERLAY_MS, resolveMotionDuration } from './tokens.js';
import {
  PRESENCE_PHASE,
  initialPresenceState,
  presenceReducer,
} from './presenceState.js';

/**
 * Keep overlay mounted through CSS exit, then unmount.
 * A11y should follow logical `isOpen`; visual follows `phase`.
 *
 * @param {boolean} isOpen
 * @param {{ durationMs?: number, onExitComplete?: () => void }} [options]
 * @returns {{ mounted: boolean, phase: 'enter'|'exit'|null }}
 */
export default function useMotionPresence(isOpen, options = {}) {
  const { durationMs = VH_MOTION_OVERLAY_MS, onExitComplete } = options;
  const [state, dispatch] = useReducer(
    presenceReducer,
    isOpen,
    initialPresenceState
  );
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;
  const exitGen = useRef(0);

  useEffect(() => {
    if (isOpen) {
      exitGen.current += 1;
      dispatch({ type: 'OPEN' });
      return undefined;
    }
    if (!state.mounted) return undefined;

    dispatch({ type: 'CLOSE' });
    const gen = exitGen.current;
    const ms = resolveMotionDuration(durationMs);
    if (ms <= 0) {
      dispatch({ type: 'EXIT_DONE' });
      onExitRef.current?.();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (gen !== exitGen.current) return;
      dispatch({ type: 'EXIT_DONE' });
      onExitRef.current?.();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [isOpen, durationMs]);

  return {
    mounted: state.mounted,
    phase: state.phase ?? (state.mounted ? PRESENCE_PHASE.ENTER : null),
  };
}

export { PRESENCE_PHASE };
