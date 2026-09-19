/**
 * Map Customer Raw context (+ meta) → project create wizard intake draft.
 * Pure — no DB / side effects.
 */

const { parseDateValue } = require('./requirementDateUtils');
const { normKey } = require('./requirementTemplateTextNorm');

const DESCRIPTION_MAX_CHARS = 8000;

/** Project form priority enums. */
const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

/**
 * Map Excel priority (High/Medium/Low/Critical/urgent…) → project form enum or null.
 * @param {string} raw
 * @returns {string|null}
 */
function mapPriorityToProject(raw) {
  const canonical = normKey(raw, { kind: 'priority' });
  const token = String(canonical || raw || '')
    .trim()
    .toLowerCase();
  if (!token) return null;
  if (token === 'critical' || token === 'urgent') return 'urgent';
  if (PROJECT_PRIORITIES.includes(token)) return token;
  return null;
}

/**
 * @param {Date|null} date
 * @returns {string} YYYY-MM-DD or ''
 */
function toDateInputValue(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * @param {Array<{ label: string, value: string }>} sections
 * @returns {string}
 */
function composeDescription(sections) {
  const parts = [];
  for (const s of sections) {
    const value = String(s.value || '').trim();
    if (!value) continue;
    const label = String(s.label || '').trim();
    parts.push(label ? `${label}\n${value}` : value);
  }
  let text = parts.join('\n\n').trim();
  if (text.length > DESCRIPTION_MAX_CHARS) {
    text = `${text.slice(0, DESCRIPTION_MAX_CHARS - 1).trim()}…`;
  }
  return text;
}

/**
 * @param {{
 *   context?: Record<string, string>,
 *   meta?: { projectName?: string, customerName?: string },
 * }} parsed
 * @returns {{
 *   title: string,
 *   description: string,
 *   priority: string|null,
 *   dueDate: string,
 *   customerName: string,
 * }}
 */
function mapCustomerRawToProjectIntakeDraft(parsed = {}) {
  const context = parsed.context && typeof parsed.context === 'object' ? parsed.context : {};
  const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};

  const title =
    String(context.projectName || '').trim() || String(meta.projectName || '').trim() || '';

  const customerName =
    String(context.customer || '').trim() || String(meta.customerName || '').trim() || '';

  const description = composeDescription([
    { label: 'Project Objective', value: context.projectObjective },
    { label: 'Business Scope', value: context.businessScope },
    { label: 'Business Description', value: context.businessDescription },
    { label: 'Business Problem', value: context.businessProblem },
    { label: 'Expected Users / Scale', value: context.targetUsers },
    { label: 'Expected Scale', value: context.expectedScale },
    { label: 'Expected Outcome', value: context.expectedOutcome },
    { label: 'Platform', value: context.targetPlatform },
    { label: 'Existing System', value: context.existingSystem },
    { label: 'Integration', value: context.integration },
    { label: 'Constraints', value: context.constraint },
    { label: 'Technology', value: context.technology },
    { label: 'Deliverables', value: context.deliverables },
    { label: 'Dependencies', value: context.dependencies },
  ]);

  const priority = mapPriorityToProject(context.priority);
  const dueDate = toDateInputValue(parseDateValue(context.deadline));

  return {
    title,
    description,
    priority,
    dueDate,
    customerName,
  };
}

module.exports = {
  mapCustomerRawToProjectIntakeDraft,
  mapPriorityToProject,
  composeDescription,
  toDateInputValue,
  DESCRIPTION_MAX_CHARS,
};
