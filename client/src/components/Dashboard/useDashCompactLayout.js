import { useEffect, useState } from 'react';

export const DASH_LG_MIN_PX = 1024;

export function useMediaQuery(query, defaultMatches = false) {
  const [matches, setMatches] = useState(defaultMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Viewport hẹp hơn laptop (`lg`) — mobile-first, mặc định true để tránh typewriter/list đầy. */
export function useDashCompactLayout() {
  return useMediaQuery(`(max-width: ${DASH_LG_MIN_PX - 1}px)`, true);
}

export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)', true);
}
