/**
 * Cách duyệt một cổng (WHAT / HOW) khi có từ 2 vai trò.
 * Tuần tự: thứ tự duyệt, người cuối là Tổng duyệt.
 * Song song: vai trò duyệt cùng lúc, một vai trò tổng hợp, một vai trò Tổng duyệt.
 * Tổng duyệt là người xác nhận cổng.
 */

const GATE_KEYS = Object.freeze(['what', 'how']);

function uniqueRoleKeys(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const key = String(item || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function emptyGateReviewPlan() {
  return {
    mode: '',
    order: [],
    parallelRoleKeys: [],
    synthesisRoleKey: '',
    finalRoleKey: '',
  };
}

function emptyGateReviewPolicy() {
  return { what: emptyGateReviewPlan(), how: emptyGateReviewPlan() };
}

/**
 * @param {object} raw
 * @param {string[]} roleKeys vai trò đã chọn trong cổng
 */
function normalizeGateReviewPlan(raw = {}, roleKeys = []) {
  const keys = uniqueRoleKeys(roleKeys);
  const keySet = new Set(keys);
  if (keys.length < 2) {
    return {
      mode: 'single',
      order: keys.slice(),
      parallelRoleKeys: [],
      synthesisRoleKey: '',
      finalRoleKey: keys[0] || '',
    };
  }
  const mode = raw?.mode === 'parallel' || raw?.mode === 'sequential' ? raw.mode : '';
  if (mode === 'sequential') {
    const order = uniqueRoleKeys(raw?.order).filter((key) => keySet.has(key));
    for (const key of keys) {
      if (!order.includes(key)) order.push(key);
    }
    return {
      mode,
      order,
      parallelRoleKeys: [],
      synthesisRoleKey: '',
      finalRoleKey: order[order.length - 1] || '',
    };
  }
  if (mode === 'parallel') {
    const synthesisRoleKey = keySet.has(String(raw?.synthesisRoleKey || '').trim().toLowerCase())
      ? String(raw.synthesisRoleKey).trim().toLowerCase()
      : '';
    const finalRoleKey = keySet.has(String(raw?.finalRoleKey || '').trim().toLowerCase())
      ? String(raw.finalRoleKey).trim().toLowerCase()
      : '';
    return {
      mode,
      order: [],
      parallelRoleKeys: uniqueRoleKeys(raw?.parallelRoleKeys).filter((key) => keySet.has(key)),
      synthesisRoleKey,
      finalRoleKey,
    };
  }
  return emptyGateReviewPlan();
}

/** @returns {string[]} mã lỗi: mode | parallel | synthesis | final | distinct | coverage */
function gateReviewPlanErrors(plan = {}, roleKeys = []) {
  const keys = uniqueRoleKeys(roleKeys);
  if (keys.length < 2) return [];
  if (plan.mode !== 'sequential' && plan.mode !== 'parallel') return ['mode'];
  if (plan.mode === 'sequential') {
    const order = uniqueRoleKeys(plan.order);
    if (order.length !== keys.length || keys.some((key) => !order.includes(key))) return ['order'];
    return [];
  }
  const errors = [];
  if (!uniqueRoleKeys(plan.parallelRoleKeys).length) errors.push('parallel');
  if (!plan.synthesisRoleKey || !keys.includes(plan.synthesisRoleKey)) errors.push('synthesis');
  if (!plan.finalRoleKey || !keys.includes(plan.finalRoleKey)) errors.push('final');
  if (
    plan.synthesisRoleKey &&
    plan.finalRoleKey &&
    plan.synthesisRoleKey === plan.finalRoleKey
  ) {
    errors.push('distinct');
  }
  const covered = new Set(
    [...uniqueRoleKeys(plan.parallelRoleKeys), plan.synthesisRoleKey, plan.finalRoleKey].filter(Boolean)
  );
  if (keys.some((key) => !covered.has(key))) errors.push('coverage');
  return errors;
}

function normalizeGateReviewPolicy(raw = {}, roleKeysByGate = {}) {
  return {
    what: normalizeGateReviewPlan(raw?.what, roleKeysByGate.what || []),
    how: normalizeGateReviewPlan(raw?.how, roleKeysByGate.how || []),
  };
}

function referencedRoleKeys(plan = {}) {
  return uniqueRoleKeys([
    ...(plan.order || []),
    ...(plan.parallelRoleKeys || []),
    plan.synthesisRoleKey,
    plan.finalRoleKey,
  ]);
}

/**
 * @param {object} policy
 * @param {string[]} memberRoleKeys
 */
function assertGateReviewPolicy(policy = {}, memberRoleKeys = []) {
  const members = new Set(uniqueRoleKeys(memberRoleKeys));
  for (const gate of GATE_KEYS) {
    const plan = policy?.[gate] || emptyGateReviewPlan();
    const referenced = referencedRoleKeys(plan);
    const unknown = referenced.filter((key) => key && !members.has(key));
    if (unknown.length) {
      const err = new Error(`Vai trò duyệt không có trong thành viên: ${unknown.join(', ')}`);
      err.statusCode = 400;
      err.errorCode = 'GATE_REVIEW_ROLE_UNKNOWN';
      throw err;
    }
    const roleKeys =
      plan.mode === 'sequential'
        ? uniqueRoleKeys(plan.order)
        : plan.mode === 'parallel'
          ? referenced
          : plan.finalRoleKey
            ? [plan.finalRoleKey]
            : [];
    const problems = gateReviewPlanErrors(plan, roleKeys.length >= 2 ? roleKeys : []);
    if (problems.length) {
      const err = new Error('Chưa chọn cách duyệt cho cổng có từ hai vai trò.');
      err.statusCode = 400;
      err.errorCode = 'GATE_REVIEW_PLAN_INVALID';
      err.details = { gate, problems };
      throw err;
    }
  }
  return { ok: true };
}

module.exports = {
  GATE_KEYS,
  uniqueRoleKeys,
  emptyGateReviewPlan,
  emptyGateReviewPolicy,
  normalizeGateReviewPlan,
  normalizeGateReviewPolicy,
  gateReviewPlanErrors,
  referencedRoleKeys,
  assertGateReviewPolicy,
};
