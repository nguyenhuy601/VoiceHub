/** Shared Project Role permission matrix groups (Admin + Hub Settings). */
export const PROJECT_ROLE_PERMISSION_GROUPS = Object.freeze([
  {
    id: 'project',
    title: 'Project',
    keys: [
      'project:view',
      'project:edit',
      'project:archive',
      'project:complete',
      'project:delete',
      'project:roles',
    ],
  },
  {
    id: 'task',
    title: 'Task',
    keys: [
      'task:view',
      'task:create',
      'task:update',
      'task:change_status',
      'task:drag_to_done',
      'task:delete',
      'task:assign',
      'task:ai_confirm',
      'task:comment',
      'task:estimate',
      'story:create',
      'story:update',
      'bug:create',
    ],
  },
  {
    id: 'epic_sprint_backlog',
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
    id: 'approval_delivery',
    title: 'Approval / Delivery / Report / Activity',
    keys: [
      'approval:request',
      'approval:decide',
      'approval:manage_policy',
      'delivery:view',
      'delivery:manage',
      'report:view',
      'activity:view',
      'uat:sign_off',
      'handover:accept',
    ],
  },
  {
    id: 'repository',
    title: 'Repository',
    keys: ['repository:view', 'repository:push', 'repository:merge'],
  },
  {
    id: 'wiki_meeting_release',
    title: 'Wiki / Meeting / Release',
    keys: [
      'wiki:view',
      'wiki:edit',
      'meeting:view',
      'meeting:create',
      'release:view',
      'release:create',
    ],
  },
  {
    id: 'board',
    title: 'Board',
    keys: ['board:manage_lists', 'board:admin'],
  },
  {
    id: 'files_members_settings',
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
    id: 'change_request',
    title: 'Change request',
    keys: [
      'change_request:view',
      'change_request:create',
      'change_request:update',
      'change_request:delete',
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis',
    keys: [
      'analysis:view',
      'analysis:document_upload',
      'analysis:artifact_import',
      'analysis:artifact_edit',
      'analysis:submit_ba_review',
      'analysis:ba_review',
      'analysis:tech_review',
      'analysis:po_review',
      'analysis:manage_trace',
      'analysis:cut_srs',
      'delivery_phase:change',
    ],
  },
  {
    id: 'planning',
    title: 'Planning',
    keys: [
      'planning:view',
      'planning:artifact_edit',
      'planning:submit_review',
      // planning:ba_review — legacy DEC D9; không expose trong matrix UI
      'planning:tech_review',
      'planning:pm_review',
      'planning:po_review',
      'planning:cut_baseline',
      'planning:publish_wbs',
    ],
  },
]);

/** Stable group ids for locale + UI keys. */
export const PROJECT_PERM_GROUP_IDS = Object.freeze(
  PROJECT_ROLE_PERMISSION_GROUPS.map((g) => g.id)
);

/** Flat list of permission keys exposed in matrix UI. */
export const PROJECT_PERM_KEYS_FOR_LABELS = Object.freeze(
  PROJECT_ROLE_PERMISSION_GROUPS.flatMap((g) => g.keys)
);
