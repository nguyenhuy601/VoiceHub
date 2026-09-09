/** Shared Project Role permission matrix groups (Admin + Hub Settings). */
export const PROJECT_ROLE_PERMISSION_GROUPS = Object.freeze([
  {
    title: 'Project',
    keys: ['project:view', 'project:edit', 'project:archive', 'project:delete'],
  },
  {
    title: 'Task',
    keys: [
      'task:view',
      'task:create',
      'task:update',
      'task:change_status',
      'task:delete',
      'task:assign',
      'task:comment',
      'task:estimate',
      'story:create',
      'story:update',
      'bug:create',
    ],
  },
  {
    title: 'Epic / Sprint / Backlog',
    keys: [
      'epic:create',
      'epic:update',
      'epic:delete',
      'sprint:view',
      'sprint:create',
      'sprint:start',
      'sprint:close',
      'sprint:delete',
      'backlog:view',
      'backlog:update',
      'backlog:prioritize',
    ],
  },
  {
    title: 'Approval / Delivery / Report',
    keys: [
      'approval:request',
      'approval:decide',
      'approval:manage_policy',
      'delivery:view',
      'delivery:manage',
      'report:view',
    ],
  },
  {
    title: 'Repository',
    keys: ['repository:view', 'repository:push', 'repository:merge'],
  },
  {
    title: 'Wiki / Meeting / Release',
    keys: ['wiki:view', 'wiki:edit', 'meeting:view', 'meeting:create', 'release:view', 'release:create'],
  },
  {
    title: 'Files / Members / Settings',
    keys: [
      'files:view',
      'files:upload',
      'files:delete',
      'members:view',
      'members:manage',
      'settings:view',
      'settings:update',
    ],
  },
  {
    title: 'Change request',
    keys: [
      'change_request:view',
      'change_request:create',
      'change_request:update',
      'change_request:delete',
    ],
  },
]);
