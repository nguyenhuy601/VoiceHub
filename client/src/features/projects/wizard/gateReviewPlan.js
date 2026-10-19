/** Cách duyệt cổng WHAT / HOW. Khớp gateReviewPolicy bên project-service. */

export function uniqueRoleKeys(raw) {
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

export function emptyGateReviewPlan() {
  return {
    mode: '',
    order: [],
    parallelRoleKeys: [],
    synthesisRoleKey: '',
    finalRoleKey: '',
  };
}

export function emptyGateReviewPolicy() {
  return { what: emptyGateReviewPlan(), how: emptyGateReviewPlan() };
}

export function normalizeGateReviewPlan(raw = {}, roleKeys = []) {
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

export function gateReviewPlanErrors(plan = {}, roleKeys = []) {
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
  if (plan.synthesisRoleKey && plan.finalRoleKey && plan.synthesisRoleKey === plan.finalRoleKey) {
    errors.push('distinct');
  }
  const covered = new Set(
    [...uniqueRoleKeys(plan.parallelRoleKeys), plan.synthesisRoleKey, plan.finalRoleKey].filter(Boolean)
  );
  if (keys.some((key) => !covered.has(key))) errors.push('coverage');
  return errors;
}

export function normalizeGateReviewPolicy(raw = {}, roleKeysByGate = {}) {
  return {
    what: normalizeGateReviewPlan(raw?.what, roleKeysByGate.what || []),
    how: normalizeGateReviewPlan(raw?.how, roleKeysByGate.how || []),
  };
}
