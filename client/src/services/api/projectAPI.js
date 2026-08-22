import apiClient from './apiClient';
import { DEFAULT_PROJECT_ROLE_KEYS, PROJECT_ROLE_LABELS, DEFAULT_PROJECT_ROLE_CAN_ASSIGN } from '../../utils/roleTaxonomy';

function withOrg(organizationId, config = {}) {
  const orgId = String(organizationId || '').trim();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
    // Gateway strip x-organization-id từ client — truyền query để service đọc được.
    params: {
      ...(config.params || {}),
      ...(orgId ? { organizationId: orgId } : {}),
    },
  };
}

/** Fallback labels khi GET role-catalog lỗi mạng — mirror BE projectRoleDefaults. */
export const DEFAULT_PROJECT_ROLES = Object.values(DEFAULT_PROJECT_ROLE_KEYS).map((key, index) => ({
  key,
  label: PROJECT_ROLE_LABELS[key] || key,
  canAssign: Boolean(DEFAULT_PROJECT_ROLE_CAN_ASSIGN[key]),
  sortOrder: (index + 1) * 10,
}));

/**
 * Map list Projects → rows chọn Kanban (._id = defaultBoardId, .projectId = Project._id).
 */
export function mapProjectsToBoardPickerRows(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .map((p) => {
      const projectId = String(p?.projectId || p?._id || '').trim();
      const boardId = String(p?.defaultBoardId || p?.boards?.[0]?._id || '').trim();
      if (!projectId || !boardId) return null;
      return {
        ...p,
        _id: boardId,
        projectId,
        title: p.title,
        projectCode: p.projectCode,
        description: p.description,
        dueDate: p.dueDate,
        visibility: p.visibility,
        background: p.background,
        defaultBoardId: boardId,
      };
    })
    .filter(Boolean);
}

/**
 * Canonical Project API (`/api/projects`).
 * projectId ≠ boardId (defaultBoardId trên response create/list).
 */
export const projectAPI = {
  create: (payload = {}) => {
    const body = { ...(payload || {}) };
    delete body.workspaceSlug;
    delete body.slug;
    return apiClient.post('/projects', body);
  },

  list: (params = {}) => {
    const organizationId = String(params?.organizationId || '').trim();
    const rest = { ...(params || {}) };
    return apiClient.get('/projects', withOrg(organizationId, { params: rest }));
  },

  get: (projectId) => apiClient.get(`/projects/${encodeURIComponent(projectId)}`),

  patch: (projectId, body = {}) =>
    apiClient.patch(`/projects/${encodeURIComponent(projectId)}`, body),

  archive: (projectId) => apiClient.post(`/projects/${encodeURIComponent(projectId)}/archive`),

  getOverview: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/overview`),

  getActivity: (projectId, params = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/activity`, { params }),

  getFiles: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/files`),

  getWorkPreview: (projectId, params = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/work-preview`, {
      params: {
        kind: params.kind || undefined,
        id: params.id || undefined,
      },
    }),

  listMembers: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/members`),

  listMemberCandidates: (projectId, projectRoleKey) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/member-candidates`, {
      params: { projectRoleKey },
    }),

  /**
   * @param {string} projectId
   * @param {string} memberUserId
   * @param {string[]} projectRoleKeys
   * @param {string|{ boardRole?: string, allocations?: Array, joinDate?: string|null, leaveDate?: string|null, billable?: boolean, status?: string }} [optionsOrBoardRole]
   */
  setMemberRoles: (projectId, memberUserId, projectRoleKeys, optionsOrBoardRole) => {
    const body = { projectRoleKeys };
    if (typeof optionsOrBoardRole === 'string') {
      body.boardRole = optionsOrBoardRole;
    } else if (optionsOrBoardRole && typeof optionsOrBoardRole === 'object') {
      const o = optionsOrBoardRole;
      if (o.boardRole !== undefined) body.boardRole = o.boardRole;
      if (o.allocations !== undefined) body.allocations = o.allocations;
      if (o.joinDate !== undefined) body.joinDate = o.joinDate;
      if (o.leaveDate !== undefined) body.leaveDate = o.leaveDate;
      if (o.billable !== undefined) body.billable = o.billable;
      if (o.status !== undefined) body.status = o.status;
      if (o.otOverride) body.otOverride = true;
      if (o.otRationale != null && String(o.otRationale).trim()) {
        body.otRationale = String(o.otRationale).trim();
      }
    }
    return apiClient.put(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberUserId)}/roles`,
      body
    );
  },

  listBoards: (projectId, organizationId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/boards`,
      withOrg(organizationId)
    ),

  createBoard: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/boards`, body),

  listSprints: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/sprints`),

  createSprint: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/sprints`, body),

  patchSprint: (projectId, sprintId, body = {}) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintId)}`,
      body
    ),

  deleteSprint: (projectId, sprintId) =>
    apiClient.delete(
      `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintId)}`
    ),

  completeSprintPreview: (projectId, sprintId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintId)}/complete-preview`
    ),

  completeSprint: (projectId, sprintId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintId)}/complete`,
      body
    ),

  completeProjectPreview: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/complete-preview`),

  completeProject: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/complete`, body),

  listChangeRequests: (projectId, params = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/change-requests`, {
      params: {
        q: params.q || undefined,
        type: params.type || undefined,
        status: params.status || undefined,
        priority: params.priority || undefined,
        sort: params.sort || undefined,
        page: params.page,
        size: params.size,
      },
    }),

  getChangeRequest: (projectId, crId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/change-requests/${encodeURIComponent(crId)}`
    ),

  createChangeRequest: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/change-requests`, {
      title: body.title,
      description: body.description,
      type: body.type,
      priority: body.priority,
      reason: body.reason,
      current: body.current,
      requestedChange: body.requestedChange,
    }),

  patchChangeRequest: (projectId, crId, body = {}) => {
    const payload = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.description !== undefined) payload.description = body.description;
    if (body.type !== undefined) payload.type = body.type;
    if (body.priority !== undefined) payload.priority = body.priority;
    if (body.reason !== undefined) payload.reason = body.reason;
    if (body.current !== undefined) payload.current = body.current;
    if (body.requestedChange !== undefined) payload.requestedChange = body.requestedChange;
    if (body.status !== undefined) payload.status = body.status;
    if (body.impact !== undefined) payload.impact = body.impact;
    if (body.linkWorkItemId !== undefined) payload.linkWorkItemId = body.linkWorkItemId;
    if (body.unlinkWorkItemId !== undefined) payload.unlinkWorkItemId = body.unlinkWorkItemId;
    return apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/change-requests/${encodeURIComponent(crId)}`,
      payload
    );
  },

  deleteChangeRequest: (projectId, crId) =>
    apiClient.delete(
      `/projects/${encodeURIComponent(projectId)}/change-requests/${encodeURIComponent(crId)}`
    ),

  listPlanningItems: (projectId, params = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/planning-items`, { params }),

  createPlanningItem: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning-items`, body),

  patchPlanningItem: (projectId, itemId, body = {}) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/planning-items/${encodeURIComponent(itemId)}`,
      body
    ),

  getPlanningItemHistory: (projectId, itemId, params = {}) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/planning-items/${encodeURIComponent(itemId)}/history`,
      { params: { limit: params.limit, before: params.before } }
    ),

  deletePlanningItem: (projectId, itemId) =>
    apiClient.delete(
      `/projects/${encodeURIComponent(projectId)}/planning-items/${encodeURIComponent(itemId)}`
    ),

  listBacklog: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/backlog`),

  linkTaskPlanning: (projectId, taskId, body = {}) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/planning`,
      body
    ),

  /**
   * Member-readable role catalog (seed UI). Không dùng /admin.
   * @param {string} organizationId
   */
  listRoleCatalog: (organizationId) =>
    apiClient.get('/projects/role-catalog', withOrg(organizationId, { params: { organizationId } })),

  /** Phase 3 — Department Capacity */
  getDepartmentCapacity: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/resources/capacity',
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  /** Phase 3 — Resource Planner (org-scoped). config.skipPermissionDeniedToast cho best-effort badge. */
  getResourcePlanner: (organizationId, params = {}, config = {}) =>
    apiClient.get(
      '/projects/resources/planner',
      withOrg(organizationId, {
        params: { ...params, organizationId },
        skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
      })
    ),

  /**
   * Phase 2/3 — org-wide employee resource pool (admin / resource_manager).
   * params: asOf, verifiedOnly, departmentId, limit,
   *         fromDate, toDate | requirementPackId (Phase 3 capacityRange).
   */
  listOrgResourcePool: (organizationId, params = {}, config = {}) =>
    apiClient.get(
      '/projects/resources/pool',
      withOrg(organizationId, {
        params: { ...params, organizationId },
        skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
      })
    ),

  /** Phase 3 — Resource Planner (project related depts) */
  getProjectPlanner: (projectId, params = {}, config = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/resources/planner`, {
      params,
      skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
    }),

  /** Phase 3 — multi-project allocation timeline */
  getUserAllocations: (organizationId, userId, config = {}) =>
    apiClient.get(
      `/projects/resources/users/${encodeURIComponent(userId)}/allocations`,
      withOrg(organizationId, {
        params: { organizationId },
        skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
      })
    ),

  /** Employee Resource Profile aggregate (self OK; others need RM/admin). */
  getEmployeeResourceProfile: (organizationId, userId, params = {}, config = {}) =>
    apiClient.get(
      `/projects/resources/employees/${encodeURIComponent(userId)}/profile`,
      withOrg(organizationId, {
        params: { organizationId, ...params },
        skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
      })
    ),

  /** Phase 3b — Utilization (planned ∩ actual hours) */
  getUtilization: (organizationId, params = {}, config = {}) =>
    apiClient.get(
      '/projects/resources/utilization',
      withOrg(organizationId, {
        params: { ...params, organizationId },
        skipPermissionDeniedToast: Boolean(config.skipPermissionDeniedToast),
      })
    ),

  /** Historical Performance — list (admin) */
  listUserPerformance: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/resources/performance',
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  /** Historical Performance — user detail */
  getUserPerformance: (organizationId, userId, params = {}) =>
    apiClient.get(
      `/projects/resources/performance/users/${encodeURIComponent(userId)}`,
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  /** AI / estimate calibration hints */
  getEstimateHints: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/resources/estimate-hints',
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  /** Phase 5 — Approval */
  listApprovalPolicies: (organizationId, opts = {}) =>
    apiClient.get(
      '/projects/approval-policies',
      withOrg(organizationId, {
        params: {
          organizationId,
          ...(opts.projectId ? { projectId: opts.projectId } : {}),
        },
      })
    ),

  upsertApprovalPolicy: (organizationId, payload = {}) =>
    apiClient.post('/projects/approval-policies', { ...payload, organizationId }),

  updateApprovalPolicy: (organizationId, policyId, payload = {}) =>
    apiClient.put(`/projects/approval-policies/${encodeURIComponent(policyId)}`, {
      ...payload,
      organizationId,
    }),

  listApprovalInbox: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/approvals/inbox',
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  decideApproval: (requestId, body = {}, organizationId) =>
    apiClient.post(`/projects/approvals/${encodeURIComponent(requestId)}/decide`, body, {
      params: organizationId ? { organizationId } : undefined,
    }),

  cancelApproval: (requestId, body = {}) =>
    apiClient.post(`/projects/approvals/${encodeURIComponent(requestId)}/cancel`, body),

  listEntityApprovals: (entityType, entityId) =>
    apiClient.get(
      `/projects/approvals/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
    ),

  startStubApproval: (organizationId, payload = {}) =>
    apiClient.post('/projects/approvals/stub', { ...payload, organizationId }),

  bindProjectApprovalPolicy: (projectId, policyId, { changeRequestPolicyId } = {}) => {
    const body = {};
    if (policyId !== undefined) body.policyId = policyId || null;
    if (changeRequestPolicyId !== undefined) body.changeRequestPolicyId = changeRequestPolicyId || null;
    return apiClient.put(`/projects/${encodeURIComponent(projectId)}/approval-policy`, body);
  },

  submitChangeRequestApproval: (projectId, crId) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/change-requests/${encodeURIComponent(crId)}/submit-approval`
    ),

  /** Phase 6 — Governance */
  listAuditEvents: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/audit-events',
      withOrg(organizationId, { params: { ...params, organizationId } })
    ),

  getDirectorHealth: (organizationId, params = {}) =>
    apiClient.get(
      '/projects/governance/director-health',
      withOrg(organizationId, {
        params: {
          organizationId,
          ...(params.includeArchived ? { includeArchived: '1' } : {}),
        },
      })
    ),

  getRetentionPolicy: (organizationId) =>
    apiClient.get(
      '/projects/governance/retention',
      withOrg(organizationId, { params: { organizationId } })
    ),

  updateRetentionPolicy: (organizationId, payload = {}) =>
    apiClient.put('/projects/governance/retention', { ...payload, organizationId }),

  runRetentionStub: (organizationId, payload = {}) =>
    apiClient.post('/projects/governance/retention/run-stub', {
      dryRun: true,
      ...payload,
      organizationId,
    }),

  getSecurityFlags: () => apiClient.get('/projects/governance/security-flags'),
};

export default projectAPI;
