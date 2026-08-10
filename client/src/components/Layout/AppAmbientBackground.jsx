import { useCallback, useEffect, useMemo, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useTheme } from '../../context/ThemeContext';
import { buildAmbientParticlesOptions } from './ambientParticlesOptions';
import './appAmbientBackground.css';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

/**
 * Fixed ambient layer: CSS animated gradient + tsparticles (theme-aware).
 * Mount once under ThemeProvider.
 */
export default function AppAmbientBackground() {
  const { isDarkMode } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (!cancelled) setEngineReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => buildAmbientParticlesOptions(isDarkMode, { reducedMotion }),
    [isDarkMode, reducedMotion]
  );

  const particlesLoaded = useCallback(async () => {}, []);

  return (
    <div className="vh-ambient-root" aria-hidden="true">
      <div className="vh-ambient-gradient" />
      <div className="vh-ambient-glow" />
      {engineReady && !reducedMotion ? (
        <div className="vh-ambient-particles">
          <Particles
            id="vh-ambient-particles"
            key={isDarkMode ? 'dark' : 'light'}
            options={options}
            particlesLoaded={particlesLoaded}
          />
        </div>
      ) : null}
    </div>
  );
}
