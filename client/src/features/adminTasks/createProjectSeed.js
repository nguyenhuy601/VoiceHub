/**
 * Pure helpers — build create Project (G1) seed payload (FE).
 */

import { buildProjectCodeBase } from '../../utils/projectCodeGenerate';
import { DEFAULT_PROJECT_ROLE_KEYS } from '../../utils/roleTaxonomy';

export const DELEGATION_TEMPLATE_IDS = Object.freeze(['product', 'outsourcing', 'startup']);

export const PROJECT_TYPES = Object.freeze([
  'software',
  'integration',
  'maintenance',
  'research',
  'other',
]);
export const PROJECT_CATEGORIES = Object.freeze(['internal', 'customer']);
export const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
export const PROJECT_METHODOLOGIES = Object.freeze(['scrum', 'kanban', 'waterfall']);

/** Lead + common delivery roles for Create Project team picker. */
export const CREATE_PROJECT_TEAM_ROLE_KEYS = Object.freeze([
  DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
  DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER,
  DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD,
  DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER,
  DEFAULT_PROJECT_ROLE_KEYS.QA,
  DEFAULT_PROJECT_ROLE_KEYS.TESTER,
  DEFAULT_PROJECT_ROLE_KEYS.ARCHITECT,
  DEFAULT_PROJECT_ROLE_KEYS.RELEASE_MANAGER,
]);

const VIEWER_ONLY = new Set(['watcher', 'reviewer']);

export function normalizeDelegationTemplateId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return DELEGATION_TEMPLATE_IDS.includes(id) ? id : 'product';
}

export function inferBoardRoleFromProjectKeys(projectRoleKeys = []) {
  const keys = (projectRoleKeys || []).map((k) => String(k || '').trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return 'editor';
  if (keys.every((k) => VIEWER_ONLY.has(k))) return 'viewer';
  return 'editor';
}

/**
 * @param {Array<{ userId: string, projectRoleKeys?: string[], boardRole?: string }>} seedRows
 * @param {{ creatorUserId?: string }} [opts]
 */
export function buildCreateBoardMembers(seedRows, { creatorUserId } = {}) {
  const creator = String(creatorUserId || '').trim();
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(seedRows) ? seedRows : []) {
    const userId = String(raw?.userId || '').trim();
    if (!userId || (creator && userId === creator) || seen.has(userId)) continue;
    seen.add(userId);
    const projectRoleKeys = [
      ...new Set(
        (Array.isArray(raw?.projectRoleKeys) ? raw.projectRoleKeys : [])
          .map((k) => String(k || '').trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
    if (!projectRoleKeys.length) continue;
    let boardRole = String(raw?.boardRole || '').trim().toLowerCase();
    if (boardRole === 'owner' || !['editor', 'viewer'].includes(boardRole)) {
      boardRole = inferBoardRoleFromProjectKeys(projectRoleKeys);
    }
    out.push({ userId, projectRoleKeys, boardRole });
  }
  return out;
}

function toDateIso(raw) {
  if (!raw) return undefined;
  const s = String(raw);
  return s.includes('T') ? s : new Date(`${s}T23:59:00`).toISOString();
}

/**
 * @param {object} form
 * @param {{ organizationId: string, creatorUserId?: string, scopeLabel?: string }} ctx
 */
export function buildCreateBoardPayload(form, ctx = {}) {
  const organizationId = String(ctx.organizationId || form.organizationId || '').trim();
  const title = String(form.title || '').trim();
  const visibility = form.visibility === 'workspace' ? 'workspace' : 'private';
  const visibilityMode =
    String(form.visibilityMode || 'inherit').toLowerCase() === 'custom' ? 'custom' : 'inherit';
  const scopeLabel = String(ctx.scopeLabel || form.scopeLabel || '').trim();

  const expectedEndIso = toDateIso(form.expectedEndDate || form.dueDate);
  const startIso = toDateIso(form.startDate);

  const projectCode =
    String(form.projectCode || '').trim() ||
    buildProjectCodeBase({
      title,
      scopeType: 'organization',
      scopeLabel: scopeLabel || 'ORG',
      dueDate: expectedEndIso,
    });

  const category = PROJECT_CATEGORIES.includes(String(form.category || '').toLowerCase())
    ? String(form.category).toLowerCase()
    : 'internal';
  const methodology = PROJECT_METHODOLOGIES.includes(String(form.methodology || '').toLowerCase())
    ? String(form.methodology).toLowerCase()
    : 'kanban';

  const payload = {
    organizationId,
    title,
    description: String(form.description || '').trim(),
    projectCode,
    scopeLabel,
    background: String(form.background || '').trim(),
    visibility,
    visibilityMode,
    relatedDepartmentIds: Array.isArray(form.relatedDepartmentIds)
      ? form.relatedDepartmentIds.map(String).filter(Boolean)
      : [],
    delegationTemplateId: normalizeDelegationTemplateId(form.delegationTemplateId),
    members: buildCreateBoardMembers(form.members || form.seedMembers || [], {
      creatorUserId: ctx.creatorUserId,
    }),
    projectType: PROJECT_TYPES.includes(String(form.projectType || '').toLowerCase())
      ? String(form.projectType).toLowerCase()
      : 'software',
    category,
    priority: PROJECT_PRIORITIES.includes(String(form.priority || '').toLowerCase())
      ? String(form.priority).toLowerCase()
      : 'medium',
    tags: Array.isArray(form.tags)
      ? form.tags
      : String(form.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
    methodology,
    workingCalendar: String(form.workingCalendar || 'standard').trim() || 'standard',
    // Org-level project — BE maps to scopeType organization.
    scopeType: 'organization',
    scopeId: organizationId,
  };

  if (visibilityMode === 'custom' && form.visibilityPolicy) {
    payload.visibilityPolicy = form.visibilityPolicy;
  }
  if (Array.isArray(form.informationLevelOverrides) && form.informationLevelOverrides.length) {
    payload.informationLevelOverrides = form.informationLevelOverrides;
  }

  if (expectedEndIso) {
    payload.dueDate = expectedEndIso;
    payload.expectedEndDate = expectedEndIso;
  }
  if (startIso) payload.startDate = startIso;
  if (form.estimatedDurationDays != null && form.estimatedDurationDays !== '') {
    payload.estimatedDurationDays = Number(form.estimatedDurationDays);
  }

  if (methodology === 'scrum') {
    payload.sprintDurationDays = Number(form.sprintDurationDays || 14);
    payload.sprintStartDay = String(form.sprintStartDay || 'monday').toLowerCase();
  }
  if (methodology === 'kanban') {
    payload.wipLimit = Number(form.wipLimit || 0);
  }

  if (category === 'customer') {
    payload.customer = {
      name: String(form.customerName || form.customer?.name || '').trim(),
      company: String(form.customerCompany || form.customer?.company || '').trim(),
      contactPerson: String(form.contactPerson || form.customer?.contactPerson || '').trim(),
      contractCode: String(form.contractCode || form.customer?.contractCode || '').trim(),
    };
  }

  for (const key of ['projectManagerId', 'productOwnerId', 'scrumMasterId', 'techLeadId']) {
    const v = String(form[key] || '').trim();
    if (v) payload[key] = v;
  }

  return payload;
}

/**
 * @returns {''|'title'|'customer'}
 */
export function validateCreateProjectIdentity(form) {
  if (!String(form?.title || '').trim()) return 'title';
  const category = String(form?.category || 'internal').toLowerCase();
  if (category === 'customer') {
    const name = String(form?.customerName || form?.customer?.name || '').trim();
    if (!name) return 'customer';
  }
  return '';
}
