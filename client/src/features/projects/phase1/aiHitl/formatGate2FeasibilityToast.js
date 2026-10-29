/**
 * Prefer concrete feasibility failure codes / uncovered ids over generic G13 copy.
 */

const SOFT_G13_CODES = new Set(['FEAS_RESOURCE', 'FEAS_SCHEDULE', 'AC_COVERAGE_GAP']);

function clipList(values, max = 8) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!list.length) return '';
  const head = list.slice(0, max);
  const more = list.length > max ? `…(+${list.length - max})` : '';
  return `${head.join(', ')}${more}`;
}

function failureSnippet(row) {
  const code = String(row?.code || '').trim() || 'UNKNOWN';
  const detail = row?.detail && typeof row.detail === 'object' ? row.detail : {};
  const ids =
    clipList(detail.uncoveredFrIds) ||
    clipList(detail.uncoveredAcKeys) ||
    clipList(detail.uncoveredCriteria) ||
    clipList(detail.unresolvedStoryIds);
  if (ids) return `${code}: ${ids}`;
  const msg = String(row?.message || '').trim();
  if (msg) return `${code}: ${msg.slice(0, 120)}`;
  return code;
}

/**
 * @param {unknown} err
 * @param {{ resolveApiErrorMessage?: Function, fallback?: string }} [opts]
 * @returns {string}
 */
export function formatGate2FeasibilityToast(err, opts = {}) {
  const data = err?.response?.data || err?.data || {};
  const feasibility = data?.data?.feasibility || data?.feasibility || null;
  const failures = Array.isArray(feasibility?.failures) ? feasibility.failures : [];
  const hard = failures.filter((f) => {
    const code = String(f?.code || '');
    return code && !SOFT_G13_CODES.has(code) && f?.soft !== true;
  });
  const rows = (hard.length ? hard : failures).slice(0, 4);
  if (rows.length) {
    return `Feasibility chưa đạt — ${rows.map(failureSnippet).join('; ')}. Sửa plan / chạy lại HOW, hoặc forceApprove kèm lý do.`;
  }

  const code = String(data?.errorCode || err?.errorCode || '').trim();
  const base =
    typeof opts.resolveApiErrorMessage === 'function'
      ? opts.resolveApiErrorMessage(err, { fallback: opts.fallback })
      : String(data?.message || err?.message || opts.fallback || '').trim();

  if (code === 'G13_FEASIBILITY_FAILED' || code === 'G13_FEASIBILITY_MISSING') {
    return base || opts.fallback || 'Feasibility chưa đạt.';
  }
  return base || opts.fallback || 'Feasibility chưa đạt.';
}

export { SOFT_G13_CODES };
