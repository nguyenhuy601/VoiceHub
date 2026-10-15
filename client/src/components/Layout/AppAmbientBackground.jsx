import { useCallback, useEffect, useMemo, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useTheme } from '../../context/ThemeContext';
import { buildAmbientParticlesOptions } from './ambientParticlesOptions';

const AMBIENT_GRADIENT_DARK =
  'linear-gradient(135deg, #020817 0%, #0c1a3a 28%, #0e3a5f 52%, #0369a1 72%, #022c4a 88%, #020817 100%)';
const AMBIENT_GRADIENT_LIGHT =
  'linear-gradient(135deg, #eef6ff 0%, #bae6fd 22%, #7dd3fc 42%, #60a5fa 62%, #93c5fd 78%, #dbeafe 100%)';

const AMBIENT_GLOW_DARK = [
  'radial-gradient(ellipse 55% 40% at 15% 20%, rgba(56, 189, 248, 0.18), transparent 60%)',
  'radial-gradient(ellipse 45% 35% at 85% 75%, rgba(14, 165, 233, 0.14), transparent 55%)',
  'radial-gradient(ellipse 60% 30% at 50% 100%, rgba(34, 211, 238, 0.12), transparent 50%)',
].join(', ');

const AMBIENT_GLOW_LIGHT = [
  'radial-gradient(ellipse 55% 42% at 18% 18%, rgba(14, 165, 233, 0.32), transparent 58%)',
  'radial-gradient(ellipse 48% 38% at 82% 72%, rgba(37, 99, 235, 0.26), transparent 55%)',
  'radial-gradient(ellipse 62% 34% at 48% 100%, rgba(56, 189, 248, 0.22), transparent 52%)',
].join(', ');

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
 * Fixed ambient layer: Tailwind animated gradient + tsparticles (theme-aware).
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
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className={`absolute inset-[-20%] bg-[length:200%_200%] will-change-[background-position] motion-reduce:animate-none motion-reduce:bg-[position:50%_50%] ${
          reducedMotion ? 'bg-[position:50%_50%]' : 'animate-ambient-shift'
        }`}
        style={{
          backgroundImage: isDarkMode ? AMBIENT_GRADIENT_DARK : AMBIENT_GRADIENT_LIGHT,
        }}
      />
      <div
        className={`absolute inset-0 ${isDarkMode ? 'opacity-90' : 'opacity-100'}`}
        style={{
          background: isDarkMode ? AMBIENT_GLOW_DARK : AMBIENT_GLOW_LIGHT,
        }}
      />
      {engineReady && !reducedMotion ? (
        <div className="absolute inset-0 [&_canvas]:!block [&_canvas]:!h-full [&_canvas]:!w-full">
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
