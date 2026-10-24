/**
 * Legacy po/tech/pm section hints (change-proposal owner fallback only).
 * Gate2 với gateReviewPolicy: mỗi vai trò đã chọn duyệt toàn bộ section — không filter UI theo map này.
 */

export const GATE2_TRACKS = Object.freeze(['po', 'tech', 'pm']);

export const GATE2_DOMAIN_SECTIONS = Object.freeze({
  po: Object.freeze(['scope']),
  tech: Object.freeze(['tasks', 'risks', 'quality']),
  pm: Object.freeze([
    'schedule',
    'releases',
    'dependencies',
    'assignments',
  ]),
});

export const GATE2_DOMAIN_FOCUS_KEY = Object.freeze({
  po: 'requirements.gate2DomainPo',
  tech: 'requirements.gate2DomainTech',
  pm: 'requirements.gate2DomainPm',
});

/** @deprecated Không dùng để ẩn section Gate2 khi có reviewPlan theo role. */
export function sectionsForTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  return GATE2_DOMAIN_SECTIONS[key] ? [...GATE2_DOMAIN_SECTIONS[key]] : [];
}

export function isBlockingProposal(row) {
  const status = String(row?.status || '');
  if (status === 'pending' || status === 'escalated') return true;
  if (status === 'rejected' && !row?.resolution) return true;
  return false;
}
