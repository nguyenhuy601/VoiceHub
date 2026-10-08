/** Normalize degrees to [-180, 180]. */
export function normalizeDeg(deg) {
  let a = deg;
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

/** Degrees: 0 = right, 90 = down, -90 = up (atan2 / CSS rotate). */
export function beamAngleDeg(originX, originY, mouseX, mouseY) {
  return (Math.atan2(mouseY - originY, mouseX - originX) * 180) / Math.PI;
}

export function normalizeAngleDiffDeg(a, b) {
  return Math.abs(normalizeDeg(a - b));
}

/** Horizontal-left aim → illuminate password (~±145…±180). */
export function isPasswordAimAngle(deg) {
  const a = Math.abs(normalizeDeg(deg));
  return a >= 145;
}

/** Up-left aim → illuminate owl (~-120…-160). */
export function isOwlAimAngle(deg) {
  const a = normalizeDeg(deg);
  return a <= -115 && a >= -160;
}

export function pointInExpandedRect(point, rect, pad = 16) {
  if (!point || !rect) return false;
  return (
    point.x >= rect.left - pad &&
    point.x <= rect.right + pad &&
    point.y >= rect.top - pad &&
    point.y <= rect.bottom + pad
  );
}

export function coneHitsRect(origin, beamDeg, halfSpreadDeg, maxDist, rect, minDist = 12) {
  if (!origin || !rect) return false;
  const samples = [
    { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom },
    { x: (rect.left + rect.right) / 2, y: rect.top },
    { x: rect.left, y: (rect.top + rect.bottom) / 2 },
  ];
  return samples.some((p) => {
    const dist = Math.hypot(p.x - origin.x, p.y - origin.y);
    if (dist < minDist || dist > maxDist) return false;
    const a = beamAngleDeg(origin.x, origin.y, p.x, p.y);
    return normalizeAngleDiffDeg(beamDeg, a) <= halfSpreadDeg;
  });
}
