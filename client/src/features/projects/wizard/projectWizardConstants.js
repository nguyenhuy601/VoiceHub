import { DEFAULT_PROJECT_ROLE_KEYS } from '../../../utils/roleTaxonomy.js';

/** Phase 1 intake: Identity → Roster → Confirm (no board setup). */
export const PROJECT_WIZARD_STEPS = Object.freeze(['identity', 'roster', 'confirm']);

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

/** @deprecated board setup moved to Phase 2 */
export const PROJECT_WORKFLOW_CARDS = Object.freeze([
  {
    id: 'agile',
    labelKey: 'adminTasks.wizardWorkflowAgile',
    labelFallback: 'Agile',
    methodology: 'scrum',
    workflowTemplateKey: 'startup',
    descriptionKey: 'adminTasks.wizardWorkflowAgileHint',
    descriptionFallback: 'Quy trình linh hoạt, cột tối giản (Todo → Doing → Done).',
    columns: Object.freeze(['To Do', 'Doing', 'Done']),
  },
  {
    id: 'scrum',
    labelKey: 'adminTasks.wizardWorkflowScrum',
    labelFallback: 'Scrum',
    methodology: 'scrum',
    workflowTemplateKey: 'sme',
    descriptionKey: 'adminTasks.wizardWorkflowScrumHint',
    descriptionFallback: 'Sprint + Review (Todo → Doing → Review → Done).',
    columns: Object.freeze(['To Do', 'Doing', 'Review', 'Done']),
  },
  {
    id: 'kanban',
    labelKey: 'adminTasks.wizardWorkflowKanban',
    labelFallback: 'Kanban',
    methodology: 'kanban',
    workflowTemplateKey: 'default_board',
    descriptionKey: 'adminTasks.wizardWorkflowKanbanHint',
    descriptionFallback: 'Luồng liên tục với WIP (Todo → In progress → Review → Done).',
    columns: Object.freeze(['To Do', 'In Progress', 'In Review', 'Done']),
  },
]);

export function resolveWorkflowCard(cardId) {
  const id = String(cardId || '').trim().toLowerCase();
  return PROJECT_WORKFLOW_CARDS.find((c) => c.id === id) || PROJECT_WORKFLOW_CARDS[2];
}

export function mapWorkflowCardToBackend(cardId) {
  const card = resolveWorkflowCard(cardId);
  return {
    methodology: card.methodology,
    workflowTemplateKey: card.workflowTemplateKey,
  };
}

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

export function previewColumnsForCard(cardId) {
  return [...(resolveWorkflowCard(cardId).columns || [])];
}

export const WIZARD_PM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER;
export const WIZARD_SM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER;
export const WIZARD_PO_ROLE = DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER;
export const WIZARD_BA_ROLE = DEFAULT_PROJECT_ROLE_KEYS.BUSINESS_ANALYST;
export const WIZARD_DEFAULT_MEMBER_ROLE = DEFAULT_PROJECT_ROLE_KEYS.BUSINESS_ANALYST;

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
