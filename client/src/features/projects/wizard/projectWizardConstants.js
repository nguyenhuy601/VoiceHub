import { DEFAULT_PROJECT_ROLE_KEYS } from '../../../utils/roleTaxonomy.js';

/** Full-screen wizard: Name → Setup → Team */
export const PROJECT_WIZARD_STEPS = Object.freeze(['name', 'setup', 'team']);

export const PROJECT_WORK_TYPES = Object.freeze([
  { id: 'task', labelKey: 'adminTasks.wizardWorkTypeTask', labelFallback: 'Task', defaultOn: true },
  { id: 'bug', labelKey: 'adminTasks.wizardWorkTypeBug', labelFallback: 'Bug', defaultOn: true },
  { id: 'story', labelKey: 'adminTasks.wizardWorkTypeStory', labelFallback: 'Story', defaultOn: true },
  { id: 'epic', labelKey: 'adminTasks.wizardWorkTypeEpic', labelFallback: 'Epic', defaultOn: true },
]);

/** Hub tabs VoiceHub (not Jira List/Timeline/Forms). */
export const PROJECT_HUB_VIEW_OPTIONS = Object.freeze([
  { id: 'overview', labelKey: 'adminTasks.wizardViewOverview', labelFallback: 'Overview', defaultOn: true },
  { id: 'planning', labelKey: 'adminTasks.wizardViewPlanning', labelFallback: 'Planning', defaultOn: true },
  { id: 'board', labelKey: 'adminTasks.wizardViewBoard', labelFallback: 'Board', defaultOn: true },
  { id: 'members', labelKey: 'adminTasks.wizardViewMembers', labelFallback: 'Members', defaultOn: true },
  { id: 'files', labelKey: 'adminTasks.wizardViewFiles', labelFallback: 'Files', defaultOn: false },
  { id: 'activity', labelKey: 'adminTasks.wizardViewActivity', labelFallback: 'Activity', defaultOn: false },
]);

/**
 * Step Setup — Statuses cards → methodology + workflow template.
 */
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
  for (const wt of PROJECT_WORK_TYPES) out[wt.id] = Boolean(wt.defaultOn);
  return out;
}

export function defaultViewsEnabled() {
  const out = {};
  for (const v of PROJECT_HUB_VIEW_OPTIONS) out[v.id] = Boolean(v.defaultOn);
  return out;
}

export function previewColumnsForCard(cardId) {
  return [...(resolveWorkflowCard(cardId).columns || ['To Do', 'In Progress', 'Done'])];
}

export const WIZARD_DEFAULT_MEMBER_ROLE = DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER || 'developer';
export const WIZARD_PM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER;
export const WIZARD_SM_ROLE = DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER;

/** userId đầu tiên trong seedMembers có Project Role `roleKey`. */
export function firstSeedMemberWithRole(seedMembers, roleKey) {
  const want = String(roleKey || '').trim().toLowerCase();
  if (!want) return '';
  for (const m of Array.isArray(seedMembers) ? seedMembers : []) {
    const keys = (m.projectRoleKeys || []).map((k) => String(k || '').trim().toLowerCase());
    if (keys.includes(want)) return String(m.userId || '').trim();
  }
  return '';
}

export const SETUP_SUBPANELS = Object.freeze(['', 'workTypes', 'statuses', 'views']);
