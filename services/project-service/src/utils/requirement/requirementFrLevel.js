/**
 * FR Level helpers — Template v2.0 Module/Feature/Requirement (WHAT-only).
 * No Epic/Story/Task staffing leaves on ship path.
 */

const { FR_LEVELS, isTemplateV2 } = require('../constants/requirementTemplate.constants');
const { normKey } = require('./requirementTemplateTextNorm');

const FR_OWNER_LEVELS = Object.freeze(['Module', 'Feature']);
const FR_ROLE_REQUIRED_LEVELS = Object.freeze([]);
const FR_EXECUTION_LEVELS = Object.freeze([]);
const FR_DESC_REQUIRED_LEVELS = Object.freeze(['Requirement']);

const FR_LEVEL_TOKEN_MAP = Object.freeze({
  module: 'Module',
  feature: 'Feature',
  requirement: 'Requirement',
});

/** @deprecated kept for callers — v2 has no single leaf level */
const FR_LEAF_LEVEL = 'Requirement';

function normalizeFrLevelToken(raw) {
  return normKey(raw, { kind: 'level' }) || String(raw || '').trim();
}

function isLegacyTemplateVersion() {
  return false;
}

function hasLegacyLevelLabels() {
  return false;
}

function isLegacyGroupingStoryRow() {
  return false;
}

function shouldApplyLegacyLevelAlias() {
  return false;
}

function applyLegacyFrLevelAlias(level) {
  return level;
}

function normalizeFrRowLevel(raw) {
  return normalizeFrLevelToken(raw);
}

function normalizeFunctionalRequirementsLevels(frList = []) {
  return frList.map((row) => ({
    ...row,
    level: normalizeFrRowLevel(row.level),
  }));
}

function isFrOwnerLevel(level) {
  return FR_OWNER_LEVELS.includes(String(level || '').trim());
}

function isFrRoleRequiredLevel() {
  return false;
}

function isFrExecutionLevel() {
  return false;
}

function isFrDescRequiredLevel(level) {
  return FR_DESC_REQUIRED_LEVELS.includes(String(level || '').trim());
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

function storyHasTaskOrSubtaskChildren() {
  return false;
}

/** v2: no staffing execution leaves */
function isFrExecutionLeaf() {
  return false;
}

function isFrExecutionLeafLevel() {
  return false;
}

function isKnownFrLevel(level) {
  const l = String(level || '').trim();
  if (FR_LEVELS.includes(l)) return true;
  const token = FR_LEVEL_TOKEN_MAP[l.toLowerCase().replace(/\s+/g, '')];
  return Boolean(token);
}

function listFrExecutionLeaves() {
  return [];
}

function listRequirementRows(frList = []) {
  return (frList || []).filter((row) => String(row.level || '').trim() === 'Requirement');
}

module.exports = {
  FR_OWNER_LEVELS,
  FR_ROLE_REQUIRED_LEVELS,
  FR_EXECUTION_LEVELS,
  FR_DESC_REQUIRED_LEVELS,
  FR_LEGACY_LEVEL_LABELS: Object.freeze([]),
  LEGACY_TEMPLATE_VERSIONS: Object.freeze([]),
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
  listRequirementRows,
  isTemplateV2,
  hasLegacyLevelLabels,
};
