/**
 * Cổng HOW theo gateReviewPolicy: vai trò đã chọn duyệt toàn bộ, không chia section.
 * Không có policy → null (giữ track po/tech/pm cũ).
 */

function cleanKey(value) {
  return String(value || '').trim().toLowerCase();
}

function unique(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const key = cleanKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function readHowReviewPlan(project) {
  const plan = project?.gateReviewPolicy?.how;
  const finalRoleKey = cleanKey(plan?.finalRoleKey);
  if (!finalRoleKey) return null;
  const mode = plan?.mode === 'parallel' || plan?.mode === 'sequential' || plan?.mode === 'single'
    ? plan.mode
    : 'single';
  return {
    mode,
    order: unique(plan?.order),
    parallelRoleKeys: unique(plan?.parallelRoleKeys),
    synthesisRoleKey: cleanKey(plan?.synthesisRoleKey),
    finalRoleKey,
  };
}

function tracksFromHowPlan(plan) {
  if (!plan) return null;
  if (plan.mode === 'parallel') {
    const tracks = {};
    for (const key of plan.parallelRoleKeys) tracks[key] = { status: 'pending' };
    return tracks;
  }
  if (plan.mode === 'sequential') {
    const tracks = {};
    const reviewers = plan.order.filter((key) => key !== plan.finalRoleKey);
    reviewers.forEach((key, index) => {
      tracks[key] = { status: index === 0 ? 'pending' : 'waiting' };
    });
    return tracks;
  }
  return {};
}

function roleKeysOfTracks(plan, tracks) {
  if (plan?.mode === 'parallel') return plan.parallelRoleKeys.slice();
  if (plan?.mode === 'sequential') {
    return plan.order.filter((key) => key !== plan.finalRoleKey && tracks?.[key]);
  }
  return Object.keys(tracks || {});
}

module.exports = {
  readHowReviewPlan,
  tracksFromHowPlan,
  roleKeysOfTracks,
};
