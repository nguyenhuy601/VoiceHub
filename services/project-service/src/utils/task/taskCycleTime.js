/**
 * Cycle-time helpers — firstInProgressAt instrumentation.
 */

function isDoneLikeStatus(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return s === 'done' || s === 'completed' || s.includes('done') || s.includes('complete');
}

function isTodoLikeStatus(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  return (
    s === 'todo' ||
    s === 'backlog' ||
    s === 'open' ||
    s === 'new' ||
    s === 'planned' ||
    s === 'to_do' ||
    s === 'to-do'
  );
}

/**
 * Status (hoặc workflow category) coi là đã bắt đầu làm việc.
 * @param {string} status
 * @param {string} [category] workflow state category
 */
function isInProgressLikeStatus(status, category) {
  const cat = String(category || '')
    .trim()
    .toLowerCase();
  if (cat === 'in_progress') return true;
  if (cat === 'done' || cat === 'todo' || cat === 'initial') return false;
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (isDoneLikeStatus(s) || isTodoLikeStatus(s)) return false;
  if (
    s === 'in_progress' ||
    s === 'doing' ||
    s.includes('progress') ||
    [
      'review',
      'dev',
      'analysis',
      'qa',
      'uat',
      'deploy',
      'code_review',
      'blocked',
    ].includes(s)
  ) {
    return true;
  }
  return false;
}

/**
 * Nếu chưa có firstInProgressAt và status mới là in-progress → set now.
 * Không ghi đè nếu đã có.
 * @returns {{ firstInProgressAt?: Date } | null} patch fields hoặc null
 */
function maybeFirstInProgressPatch(taskOrCard, nextStatus, options = {}) {
  const existing = taskOrCard?.firstInProgressAt;
  if (existing) return null;
  const category = options.category;
  if (!isInProgressLikeStatus(nextStatus, category)) return null;
  return { firstInProgressAt: options.at instanceof Date ? options.at : new Date() };
}

module.exports = {
  isDoneLikeStatus,
  isTodoLikeStatus,
  isInProgressLikeStatus,
  maybeFirstInProgressPatch,
};
