import { useCallback, useEffect, useRef, useState } from 'react';
import {
  beamAngleDeg,
  isOwlAimAngle,
  isPasswordAimAngle,
} from './loginFlashlightHit';

export {
  beamAngleDeg,
  coneHitsRect,
  isOwlAimAngle,
  isPasswordAimAngle,
  normalizeAngleDiffDeg,
  normalizeDeg,
  pointInExpandedRect,
} from './loginFlashlightHit';

/**
 * Click eye → night + flashlight ON immediately.
 * Click flashlight → day.
 * Aim left → password reveal; aim up-left → owl lit (derived from angleDeg).
 */
export function useLoginFlashlight({ enabled = true, originRef } = {}) {
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [angleDeg, setAngleDeg] = useState(-180);
  const [manualReveal, setManualReveal] = useState(false);

  const activeRef = useRef(false);
  const rafRef = useRef(0);
  const pendingMouse = useRef(null);

  const readOrigin = useCallback(() => {
    const el = originRef?.current;
    if (!el?.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [originRef]);

  const track = useCallback((mouse, originPt) => {
    if (!activeRef.current || !originPt) return;
    const deg = beamAngleDeg(originPt.x, originPt.y, mouse.x, mouse.y);
    setAngleDeg(deg);
    setOrigin(originPt);
  }, []);

  useEffect(() => {
    if (!enabled || !active) return undefined;

    const flush = () => {
      rafRef.current = 0;
      const mouse = pendingMouse.current;
      const ox = readOrigin();
      if (!mouse || !ox) return;
      track(mouse, ox);
    };

    const onMove = (event) => {
      pendingMouse.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(flush);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [enabled, active, track, readOrigin]);

  const toggleFlashlight = useCallback(
    (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      if (!enabled) {
        setManualReveal((prev) => !prev);
        return;
      }

      if (activeRef.current) {
        activeRef.current = false;
        setActive(false);
        setAngleDeg(-180);
        return;
      }

      const ox =
        readOrigin() ||
        (() => {
          const r = event?.currentTarget?.getBoundingClientRect?.();
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
        })();

      let mx = event?.clientX;
      let my = event?.clientY;
      if (!Number.isFinite(mx) || !Number.isFinite(my) || Math.hypot(mx - ox.x, my - ox.y) < 8) {
        mx = ox.x - 140;
        my = ox.y;
      }

      const mouse = { x: mx, y: my };
      pendingMouse.current = mouse;
      setOrigin(ox);
      activeRef.current = true;
      setActive(true);
      track(mouse, ox);
    },
    [enabled, track, readOrigin]
  );

  const isFlashlight = enabled && active;
  const isNightOwl = enabled && active;
  const owlAim = isFlashlight && isOwlAimAngle(angleDeg);
  const passwordAim = isFlashlight && !owlAim && isPasswordAimAngle(angleDeg);
  const passwordRevealed = enabled ? passwordAim : manualReveal;

  return {
    isFlashlight,
    isNightOwl,
    passwordRevealed,
    owlLit: owlAim,
    origin,
    angleDeg,
    toggleFlashlight,
  };
}

export default useLoginFlashlight;
