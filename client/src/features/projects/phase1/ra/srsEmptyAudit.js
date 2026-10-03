/**
 * Wave 5 — SRS empty gate + minimal audit formatting (no User populate).
 */

/** True when SRS draft has zero approved artifacts (and not still loading). */
export function isSrsDraftEmpty(draft, { loading = false } = {}) {
  if (loading) return false;
  return Number(draft?.artifactCount || 0) === 0;
}

/** Short actor id for audit without cross-service User populate. */
export function formatActorRef(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  return s.length > 10 ? `…${s.slice(-8)}` : s;
}
