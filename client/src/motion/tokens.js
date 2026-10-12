/**
 * Enterprise motion tokens — sync với CSS vars `--vh-motion-*` trong index.css.
 * @see .cursor/rules/enterprise-motion.mdc
 */

export const VH_MOTION_FAST_MS = 100;
export const VH_MOTION_BASE_MS = 150;
export const VH_MOTION_SLOW_MS = 220;
/** Press feedback (active scale) — ngắn hơn fast */
export const VH_MOTION_PRESS_MS = 80;

export const VH_MOTION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const VH_MOTION_EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
export const VH_MOTION_EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

/** Overlay / modal / drawer enter-exit */
export const VH_MOTION_OVERLAY_MS = VH_MOTION_SLOW_MS;
/** Tab panel + page route fade */
export const VH_MOTION_PAGE_MS = VH_MOTION_BASE_MS;

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Duration hiệu dụng — 0 khi OS reduced-motion. */
export function resolveMotionDuration(durationMs, reduced = prefersReducedMotion()) {
  const n = Number(durationMs);
  if (!Number.isFinite(n) || n < 0) return 0;
  return reduced ? 0 : n;
}
