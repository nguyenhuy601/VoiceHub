import { DEFAULT_PROJECT_ROLE_KEYS } from '../../../utils/roleTaxonomy.js';

/** Phase 1 intake: một trang — Import+Identity(+roster)+Analysis Mode. */
export const PROJECT_WIZARD_STEPS = Object.freeze(['intake']);

/** @deprecated kept for tests / legacy panels */
export const PROJECT_WORK_TYPES = Object.freeze([
  { id: 'task', labelKey: 'adminTasks.wizardWorkTypeTask', labelFallback: 'Task', defaultOn: true },
  { id: 'bug', labelKey: 'adminTasks.wizardWorkTypeBug', labelFallback: 'Bug', defaultOn: true },
  { id: 'story', labelKey: 'adminTasks.wizardWorkTypeStory', labelFallback: 'Story', defaultOn: true },
  { id: 'epic', labelKey: 'adminTasks.wizardWorkTypeEpic', labelFallback: 'Epic', defaultOn: true },
]);

/** @deprecated */
export const PROJECT_HUB_VIEW_OPTIONS = Object.freeze([
  { id: 'overview', labelKey: 'adminTasks.wizardViewOverview', labelFallback: 'Overview', defaultOn: true },
  { id: 'planning', labelKey: 'adminTasks.wizardViewPlanning', labelFallback: 'Planning', defaultOn: true },
  { id: 'board', labelKey: 'adminTasks.wizardViewBoard', labelFallback: 'Board', defaultOn: true },
  { id: 'members', labelKey: 'adminTasks.wizardViewMembers', labelFallback: 'Members', defaultOn: true },
  { id: 'files', labelKey: 'adminTasks.wizardViewFiles', labelFallback: 'Files', defaultOn: false },
  { id: 'activity', labelKey: 'adminTasks.wizardViewActivity', labelFallback: 'Activity', defaultOn: false },
]);

export function defaultWorkTypesEnabled() {
  const out = {};
  for (const w of PROJECT_WORK_TYPES) out[w.id] = Boolean(w.defaultOn);
  return out;
}

export function defaultViewsEnabled() {
  const out = {};
  for (const v of PROJECT_HUB_VIEW_OPTIONS) out[v.id] = Boolean(v.defaultOn);
  return out;
}

export const WIZARD_PM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER;
export const WIZARD_SM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER;
export const WIZARD_PO_ROLE = DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER;
export const WIZARD_BA_ROLE = 'business_analyst';
export const WIZARD_DEFAULT_MEMBER_ROLE = WIZARD_BA_ROLE;

export function firstSeedMemberWithRole(seedMembers, roleKey) {
  const want = String(roleKey || '')
    .trim()
    .toLowerCase();
  for (const row of Array.isArray(seedMembers) ? seedMembers : []) {
    const keys = (Array.isArray(row?.projectRoleKeys) ? row.projectRoleKeys : []).map((k) =>
      String(k || '')
        .trim()
        .toLowerCase()
    );
    if (keys.includes(want)) return row;
  }
  return null;
}
