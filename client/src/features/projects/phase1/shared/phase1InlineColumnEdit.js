/**
 * Map list column id → artifact form path for inline cell edit.
 */
import { getArtifactFieldCatalog } from '../ra/artifactFieldCatalog.js';
import { choiceOptions } from './phase1ChoiceFields.js';

const COL_ALIASES = Object.freeze({
  expectedOutcome: 'expectedBusinessOutcome',
  customerRequirementIds: 'customerRequirementIds',
  relatedFr: 'relatedFrKeys',
  relatedBg: 'relatedBgKey',
  relatedBr: 'relatedBrKey',
  goal: 'goal',
  successCriteria: 'successCriteria',
  successMetric: 'successMetric',
  assumptionText: 'text',
  processName: 'processName',
  description: 'description',
  statement: 'statement',
  scopeDescription: 'description',
  workbookSource: 'source',
  analysisStatus: 'status',
  nfrScope: 'scope',
  acceptance: 'acceptanceCriteria',
  module: 'moduleLabel',
  capability: 'capabilityLabel',
  feature: 'featureLabel',
  parent: 'parentExternalKey',
  postcondition: 'postconditions',
});

const LOCKED_COLS = new Set(['id', 'status', 'source', 'importSet']);

/**
 * @param {{ id: string, isStatus?: boolean }} col
 * @param {string} kind
 * @returns {{ scope: 'top'|'structured', key: string, multiline?: boolean, tags?: boolean } | null}
 */
export function resolveRaInlineEditTarget(col, kind) {
  if (!col || LOCKED_COLS.has(col.id) || col.isStatus) return null;
  if (col.id === 'title' || col.id === 'artifact') return { scope: 'top', key: 'title' };
  if (col.id === 'summary') return { scope: 'top', key: 'summary', multiline: true };

  const kindKey = String(kind || '').trim().toUpperCase();
  let key = COL_ALIASES[col.id] || col.id;
  if (col.id === 'precondition' && kindKey === 'FR') key = 'preconditions';
  if (col.id === 'exception' && kindKey === 'UC') key = 'exceptionFlow';
  if (col.id === 'businessRule' && kindKey === 'UC') key = 'businessRules';

  const cat = getArtifactFieldCatalog(kind);
  const field = cat?.structured?.find((f) => f.key === key);
  if (!field) return null;
  return {
    scope: 'structured',
    key,
    multiline: field.control === 'textarea',
    tags: field.control === 'tags',
    choice: Boolean(choiceOptions(key)),
  };
}

/**
 * @param {object} form
 * @param {{ scope: string, key: string, tags?: boolean }} target
 */
export function readInlineFormValue(form, target) {
  if (!form || !target) return '';
  const bag = target.scope === 'top' ? form.top : form.structured;
  const v = bag?.[target.key];
  return v == null ? '' : String(v);
}

/**
 * @param {object} form
 * @param {{ scope: string, key: string }} target
 * @param {string} value
 */
export function writeInlineFormValue(form, target, value) {
  if (!form || !target) return form;
  if (target.scope === 'top') {
    return { ...form, top: { ...form.top, [target.key]: value } };
  }
  return {
    ...form,
    structured: { ...form.structured, [target.key]: value },
  };
}

/** Planning list column → draft key (workbook field). */
const PLANNING_LOCKED = new Set(['status', 'source', 'roles']);

/**
 * @param {{ id: string }} col
 * @returns {{ key: string, multiline?: boolean } | null}
 */
export function resolvePlanningInlineEditTarget(col) {
  if (!col || PLANNING_LOCKED.has(col.id)) return null;
  if (col.id === 'externalKey') return null; // identity — edit only on create
  const multiline = col.id === 'summary' || col.id === 'body' || col.id === 'mitigation';
  return { key: col.id, multiline };
}
