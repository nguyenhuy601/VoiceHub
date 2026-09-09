/** Query key factories — dùng thống nhất cho cache / invalidate */

export const queryKeys = {
  organizations: {
    all: ['organizations'],
    my: () => [...queryKeys.organizations.all, 'my'],
  },
  org: {
    all: ['org'],
    shell: (orgId) => ['org', String(orgId || ''), 'shell'],
    documentsOverview: (orgId) => ['org', String(orgId || ''), 'documents-overview'],
    detail: (orgId) => ['org', String(orgId || ''), 'detail'],
    levels: (orgId) => ['org', String(orgId || ''), 'levels'],
    structure: (orgId, includeInactive = false) => [
      'org',
      String(orgId || ''),
      'structure',
      includeInactive ? 'inactive' : 'active',
    ],
    /** Prefix invalidate cả twin includeInactive */
    structureAll: (orgId) => ['org', String(orgId || ''), 'structure'],
    channelMessages: (roomId, organizationId = '') => [
      ...queryKeys.org.all,
      'channel-messages',
      String(roomId || ''),
      String(organizationId || ''),
    ],
    taskWorkspaceScope: (orgId) => [
      ...queryKeys.org.all,
      'task-workspace-scope',
      String(orgId || ''),
    ],
  },
  projects: {
    all: ['projects'],
    list: (orgId, { excludeClosed = false } = {}) => [
      ...queryKeys.projects.all,
      'list',
      String(orgId || ''),
      excludeClosed ? 'excludeClosed' : 'allActive',
    ],
    /** Prefix invalidate mọi biến thể list của org */
    listAll: (orgId) => [...queryKeys.projects.all, 'list', String(orgId || '')],
  },
  friends: {
    all: ['friends'],
    list: (status = 'accepted') => [...queryKeys.friends.all, 'list', status],
    pending: () => [...queryKeys.friends.all, 'pending'],
  },
  notifications: {
    all: ['notifications'],
    badge: (scope, organizationId = '') => [
      ...queryKeys.notifications.all,
      'badge',
      scope,
      String(organizationId || ''),
    ],
    list: (scope, organizationId = '', limit = 50) => [
      ...queryKeys.notifications.all,
      'list',
      scope,
      String(organizationId || ''),
      limit,
    ],
    infinite: (scope, organizationId = '') => [
      ...queryKeys.notifications.all,
      'infinite',
      scope,
      String(organizationId || ''),
    ],
  },
  dashboard: {
    all: ['dashboard'],
    summary: (orgId = '', role = '') => [
      ...queryKeys.dashboard.all,
      'summary',
      String(orgId || ''),
      String(role || ''),
    ],
  },
  dm: {
    all: ['dm'],
    messages: (peerId) => [...queryKeys.dm.all, 'messages', String(peerId || '')],
  },
  requirements: {
    all: ['requirements'],
    access: (orgId) => [...queryKeys.requirements.all, 'access', String(orgId || '')],
    packs: (orgId, status = '') => [
      ...queryKeys.requirements.all,
      'packs',
      String(orgId || ''),
      String(status || ''),
    ],
  },
  rbac: {
    all: ['rbac'],
    grants: (orgId, userId) => [
      ...queryKeys.rbac.all,
      'grants',
      String(orgId || ''),
      String(userId || ''),
    ],
    catalog: () => [...queryKeys.rbac.all, 'catalog'],
    roleGroups: (orgId, roleId) => [
      ...queryKeys.rbac.all,
      'role-groups',
      String(orgId || ''),
      String(roleId || ''),
    ],
  },
  admin: {
    all: ['admin'],
    meetings: (orgId, status = 'all') => [
      ...queryKeys.admin.all,
      'meetings',
      String(orgId || ''),
      String(status || 'all'),
    ],
  },
  user: {
    all: ['user'],
    me: () => [...queryKeys.user.all, 'me'],
  },
  projectHub: {
    all: ['projectHub'],
    overview: (projectId) => [...queryKeys.projectHub.all, 'overview', String(projectId || '')],
    project: (projectId) => [...queryKeys.projectHub.all, 'project', String(projectId || '')],
    /** GET /projects/:id/boards — share page redirect + fast path + hydrate */
    boards: (projectId, organizationId = '') => [
      ...queryKeys.projectHub.all,
      'boards',
      String(projectId || ''),
      String(organizationId || ''),
    ],
    boardDetail: (boardId, scope = 'full') => [
      ...queryKeys.projectHub.all,
      'board',
      String(boardId || ''),
      scope,
    ],
    sprints: (projectId) => [...queryKeys.projectHub.all, 'sprints', String(projectId || '')],
    planningItems: (projectId) => [
      ...queryKeys.projectHub.all,
      'planningItems',
      String(projectId || ''),
    ],
    members: (projectId) => [...queryKeys.projectHub.all, 'members', String(projectId || '')],
    assignableMembers: (boardId) => [
      ...queryKeys.projectHub.all,
      'assignable',
      String(boardId || ''),
    ],
    roleCatalog: (projectId) => [
      ...queryKeys.projectHub.all,
      'roleCatalog',
      String(projectId || ''),
    ],
    activity: (projectId, limit = 10) => [
      ...queryKeys.projectHub.all,
      'activity',
      String(projectId || ''),
      Number(limit) || 10,
    ],
    files: (projectId) => [...queryKeys.projectHub.all, 'files', String(projectId || '')],
    /** filterKey: ổn định từ q|type|status|priority|sort|page|size */
    changeRequests: (projectId, filterKey = '') => [
      ...queryKeys.projectHub.all,
      'changeRequests',
      String(projectId || ''),
      String(filterKey || ''),
    ],
    changeRequestsAll: (projectId) => [
      ...queryKeys.projectHub.all,
      'changeRequests',
      String(projectId || ''),
    ],
  },
  calendar: {
    all: ['calendar'],
    feed: (yearMonth = '', organizationId = '') => [
      ...queryKeys.calendar.all,
      'feed',
      String(yearMonth || ''),
      String(organizationId || ''),
    ],
  },
};
