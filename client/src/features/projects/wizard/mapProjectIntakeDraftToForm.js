/**
 * Apply BE projectIntakeDraft onto create-wizard form fields.
 * Does not touch projectType, category, startDate.
 */

import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate.js';

const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

/**
 * @param {object} form — current wizard form
 * @param {object|null|undefined} draft — projectIntakeDraft from preview
 * @returns {object} partial for patchForm / setForm merge
 */
export function mapProjectIntakeDraftToForm(form, draft) {
  if (!draft || typeof draft !== 'object') return {};

  const prev = form && typeof form === 'object' ? form : {};
  const partial = {};

  const title = String(draft.title || '').trim();
  if (title) {
    partial.title = title;
    if (!prev.projectCodeTouched) {
      partial.projectCode = buildProjectCodeBase({ title });
    }
  }

  const description = String(draft.description || '').trim();
  if (description) {
    partial.description = description;
  }

  const priority = String(draft.priority || '')
    .trim()
    .toLowerCase();
  if (PROJECT_PRIORITIES.includes(priority)) {
    partial.priority = priority;
  }

  const dueDate = String(draft.dueDate || '').trim().slice(0, 10);
  if (dueDate) {
    partial.dueDate = dueDate;
  }

  const customerName = String(draft.customerName || '').trim();
  if (customerName) {
    partial.customerName = customerName;
  }

  return partial;
}

export default mapProjectIntakeDraftToForm;
