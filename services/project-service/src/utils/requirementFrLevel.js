/**
 * FR Level helpers — v1.2 work types (Epic/Feature/Story/Task/Subtask) + legacy v1.0/v1.1 alias.
 */

const { FR_LEVELS } = require('../constants/requirementTemplate.constants');

const FR_OWNER_LEVELS = Object.freeze(['Epic', 'Feature']);
const FR_ROLE_REQUIRED_LEVELS = Object.freeze(['Story', 'Task', 'Subtask']);
const FR_EXECUTION_LEVELS = Object.freeze(['Story', 'Task', 'Subtask']);
const FR_DESC_REQUIRED_LEVELS = Object.freeze(['Story', 'Task', 'Subtask']);

/** Legacy labels before v1.2 (also accepted on pack rows already stored). */
const FR_LEGACY_LEVEL_LABELS = Object.freeze(['Module', 'Capability', 'Requirement']);

const LEGACY_TEMPLATE_VERSIONS = Object.freeze(['1.0', '1.1']);

const FR_LEVEL_TOKEN_MAP = Object.freeze({
  epic: 'Epic',
  feature: 'Feature',
  story: 'Story',
  task: 'Task',
  subtask: 'Subtask',
  module: 'Module',
  capability: 'Capability',
  requirement: 'Requirement',
});

/** @deprecated use isFrExecutionLeaf — kept for gradual migration */
const FR_LEAF_LEVEL = 'Task';

function normalizeFrLevelToken(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return FR_LEVEL_TOKEN_MAP[key] || String(raw || '').trim();
}

function isLegacyTemplateVersion(templateVersion) {
  const v = String(templateVersion || '').trim();
  return LEGACY_TEMPLATE_VERSIONS.includes(v);
}

function hasLegacyLevelLabels(frList = []) {
  return (frList || []).some((row) => FR_LEGACY_LEVEL_LABELS.includes(String(row.level || '').trim()));
}

function isLegacyGroupingStoryRow(row, frList, templateVersion) {
  if (!isLegacyTemplateVersion(templateVersion)) return false;
  if (String(row?.level || '').trim() !== 'Story') return false;
  return storyHasTaskOrSubtaskChildren(row, buildFrChildrenByParent(frList));
}

function shouldApplyLegacyLevelAlias(templateVersion, frList = []) {
  if (isLegacyTemplateVersion(templateVersion)) return true;
  return hasLegacyLevelLabels(frList);
}

/**
 * Map v1.0/v1.1 hierarchy labels → v1.2 work types.
 * Feature→Story only on legacy branch (v1.2 Feature stays Feature).
 */
function applyLegacyFrLevelAlias(level, { templateVersion, frList } = {}) {
  if (!shouldApplyLegacyLevelAlias(templateVersion, frList)) {
    return level;
  }
  switch (level) {
    case 'Module':
      return 'Epic';
    case 'Capability':
      return 'Feature';
    case 'Feature':
      return 'Story';
    case 'Requirement':
      return 'Task';
    default:
      return level;
  }
}

function normalizeFrRowLevel(raw, options = {}) {
  const token = normalizeFrLevelToken(raw);
  return applyLegacyFrLevelAlias(token, options);
}

function normalizeFunctionalRequirementsLevels(frList = [], options = {}) {
  return frList.map((row) => ({
    ...row,
    level: normalizeFrRowLevel(row.level, {
      templateVersion: options.templateVersion,
      frList,
    }),
  }));
}

function isFrOwnerLevel(level) {
  return FR_OWNER_LEVELS.includes(String(level || '').trim());
}

function isFrRoleRequiredLevel(level) {
  const l = String(level || '').trim();
  if (FR_ROLE_REQUIRED_LEVELS.includes(l)) return true;
  return l === 'Requirement';
}

function isFrExecutionLevel(level) {
  const l = String(level || '').trim();
  if (FR_EXECUTION_LEVELS.includes(l)) return true;
  return l === 'Requirement';
}

function isFrDescRequiredLevel(level) {
  const l = String(level || '').trim();
  if (FR_DESC_REQUIRED_LEVELS.includes(l)) return true;
  return l === 'Requirement';
}

function buildFrChildrenByParent(frList = []) {
  const childrenByParent = new Map();
  for (const row of frList) {
    const parentId = String(row.parentExternalId || '').trim();
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(row);
  }
  return childrenByParent;
}

function storyHasTaskOrSubtaskChildren(row, childrenByParent) {
  const externalId = String(row.externalId || '').trim();
  const children = childrenByParent.get(externalId) || [];
  return children.some((child) => {
    const l = String(child.level || '').trim();
    return l === 'Task' || l === 'Subtask';
  });
}

/**
 * Execution leaf = row that carries staffing gate (skills/hours/role for hours+skills).
 * Task/Subtask (and legacy Requirement) always; Story only when no Task/Subtask children.
 */
function isFrExecutionLeaf(row, frList = []) {
  const level = String(row?.level || '').trim();
  if (level === 'Task' || level === 'Subtask' || level === 'Requirement') return true;
  if (level === 'Story') {
    const childrenByParent = buildFrChildrenByParent(frList);
    return !storyHasTaskOrSubtaskChildren(row, childrenByParent);
  }
  return false;
}

function isFrExecutionLeafLevel(level) {
  const l = String(level || '').trim();
  return l === 'Task' || l === 'Subtask' || l === 'Requirement';
}

function isKnownFrLevel(level) {
  const l = String(level || '').trim();
  if (FR_LEVELS.includes(l)) return true;
  if (FR_LEGACY_LEVEL_LABELS.includes(l)) return true;
  return false;
}

function listFrExecutionLeaves(frList = []) {
  return (frList || []).filter((row) => isFrExecutionLeaf(row, frList));
}

module.exports = {
  FR_OWNER_LEVELS,
  FR_ROLE_REQUIRED_LEVELS,
  FR_EXECUTION_LEVELS,
  FR_DESC_REQUIRED_LEVELS,
  FR_LEGACY_LEVEL_LABELS,
  LEGACY_TEMPLATE_VERSIONS,
  FR_LEAF_LEVEL,
  normalizeFrLevelToken,
  isLegacyTemplateVersion,
  isLegacyGroupingStoryRow,
  shouldApplyLegacyLevelAlias,
  applyLegacyFrLevelAlias,
  normalizeFrRowLevel,
  normalizeFunctionalRequirementsLevels,
  isFrOwnerLevel,
  isFrRoleRequiredLevel,
  isFrExecutionLevel,
  isFrDescRequiredLevel,
  buildFrChildrenByParent,
  storyHasTaskOrSubtaskChildren,
  isFrExecutionLeaf,
  isFrExecutionLeafLevel,
  isKnownFrLevel,
  listFrExecutionLeaves,
};
