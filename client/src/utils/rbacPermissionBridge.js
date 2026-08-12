/**
 * Bridge giữa quyền legacy gateway (chat:read, task:write, …)
 * và catalog admin UI (channel:view, task:create, …).
 *
 * Gateway / hasPermission vẫn kiểm tra resource legacy;
 * lưới chỉnh quyền dùng fine-grained catalog.
 */
import { flattenPermissionSlots } from '../config/adminRbacCatalog.js';
import {
  normalizePermissionEntries,
  permissionEntriesFromState,
  permissionStateFromEntries,
} from '../components/Organization/roleRbacUtils.js';

const CATALOG_KEY_SET = new Set(flattenPermissionSlots().map((s) => s.key));

/** Legacy key → các checkbox catalog tương ứng khi mở editor. */
export const LEGACY_TO_CATALOG = {
  'chat:read': ['channel:view', 'channel:export'],
  'chat:write': [
    'channel:view',
    'channel:create',
    'channel:update',
    'channel:manage_member',
    'channel:pin_message',
  ],
  'chat:delete': ['channel:delete', 'channel:delete_message'],

  'task:read': ['task:view', 'project:view'],
  'task:write': [
    'task:view',
    'task:create',
    'task:update',
    'task:assign',
    'task:change_status',
    'task:comment',
    'task:attach_file',
    'project:view',
    'project:create',
    'project:update',
    'project:manage_member',
  ],
  'task:delete': ['task:delete', 'project:delete'],

  'document:read': ['file:download'],
  'document:write': ['file:upload', 'file:download', 'file:restore'],
  'document:delete': ['file:delete', 'file:manage_storage'],

  'voice:read': [
    'meeting:view_recording',
    'meeting:download_recording',
    'meeting:view_transcript',
    'meeting:view_ai_summary',
  ],
  'voice:write': [
    'voice:create_room',
    'voice:manage_room',
    'voice:mute',
    'meeting:create',
  ],
  'voice:delete': ['voice:kick', 'meeting:end'],

  'organization:read': ['department:view', 'team:view'],
  'organization:write': [
    'department:view',
    'department:create',
    'department:update',
    'department:assign_manager',
    'team:view',
    'team:create',
    'team:update',
    'team:add_member',
    'team:assign_leader',
  ],
  'organization:delete': ['department:delete', 'team:delete', 'team:remove_member'],

  'organization_member:read': ['user:view'],
  'organization_member:write': [
    'user:view',
    'user:create',
    'user:update',
    'user:disable',
    'user:reset_password',
    'user:assign_department',
    'user:assign_team',
  ],
  'organization_member:delete': ['user:delete'],

  'role:read': ['system:view_audit_log'],
  'role:write': ['system:manage_role'],
  'role:delete': ['system:manage_role'],
  'role:admin': ['system:manage_role', 'system:manage_permission', 'system:manage_security'],
};

/** Resource chỉ dùng gateway legacy — không nằm trong catalog admin. */
const GATEWAY_ONLY_LEGACY_RESOURCES = new Set([
  'chat',
  'document',
  'organization',
  'organization_member',
  'role',
]);

function draftHas(draft, keys) {
  return keys.some((k) => draft?.[k]);
}

/**
 * Nạp state checkbox từ permissions đã lưu (legacy + catalog).
 * @returns {Record<string, boolean>}
 */
export function permissionDraftForEditor(permissions) {
  const exact = permissionStateFromEntries(permissions);
  const out = {};

  for (const [key, on] of Object.entries(exact)) {
    if (!on) continue;
    if (CATALOG_KEY_SET.has(key)) {
      out[key] = true;
      continue;
    }
    const mapped = LEGACY_TO_CATALOG[key];
    if (mapped) {
      for (const ck of mapped) {
        if (CATALOG_KEY_SET.has(ck)) out[ck] = true;
      }
    }
  }

  // Wildcard resource / action
  for (const p of normalizePermissionEntries(permissions)) {
    if (p.resource === '*') {
      for (const key of CATALOG_KEY_SET) out[key] = true;
      continue;
    }
    if (p.actions.includes('*') || p.actions.includes('admin')) {
      for (const key of CATALOG_KEY_SET) {
        if (key.startsWith(`${p.resource}:`)) out[key] = true;
      }
      const aliases = Object.keys(LEGACY_TO_CATALOG).filter((k) => k.startsWith(`${p.resource}:`));
      for (const lk of aliases) {
        for (const ck of LEGACY_TO_CATALOG[lk] || []) {
          if (CATALOG_KEY_SET.has(ck)) out[ck] = true;
        }
      }
    }
  }

  return out;
}

/**
 * Sinh quyền legacy gateway từ draft catalog (để API vẫn pass chat:read…).
 * @returns {{ resource: string, actions: string[] }[]}
 */
export function deriveLegacyEntriesFromCatalogDraft(draft) {
  const entries = [];

  const chat = [];
  if (draftHas(draft, ['channel:view', 'channel:export'])) chat.push('read');
  if (
    draftHas(draft, [
      'channel:create',
      'channel:update',
      'channel:manage_member',
      'channel:pin_message',
    ])
  ) {
    chat.push('write');
  }
  if (draftHas(draft, ['channel:delete', 'channel:delete_message'])) chat.push('delete');
  if (chat.length) entries.push({ resource: 'chat', actions: chat });

  const task = [];
  if (draftHas(draft, ['task:view', 'project:view'])) task.push('read');
  if (
    draftHas(draft, [
      'task:create',
      'task:update',
      'task:assign',
      'task:change_status',
      'task:comment',
      'task:attach_file',
      'project:create',
      'project:update',
      'project:manage_member',
    ])
  ) {
    task.push('write');
  }
  if (draftHas(draft, ['task:delete', 'project:delete'])) task.push('delete');
  if (task.length) entries.push({ resource: 'task', actions: task });

  const document = [];
  if (draftHas(draft, ['file:download'])) document.push('read');
  if (draftHas(draft, ['file:upload', 'file:restore'])) document.push('write');
  if (draftHas(draft, ['file:delete', 'file:manage_storage'])) document.push('delete');
  if (document.length) entries.push({ resource: 'document', actions: document });

  const voice = [];
  if (
    draftHas(draft, [
      'meeting:view_recording',
      'meeting:download_recording',
      'meeting:view_transcript',
      'meeting:view_ai_summary',
    ])
  ) {
    voice.push('read');
  }
  if (draftHas(draft, ['voice:create_room', 'voice:manage_room', 'voice:mute', 'meeting:create'])) {
    voice.push('write');
  }
  if (draftHas(draft, ['voice:kick', 'meeting:end'])) voice.push('delete');
  if (voice.length) entries.push({ resource: 'voice', actions: voice });

  const organization = [];
  if (draftHas(draft, ['department:view', 'team:view'])) organization.push('read');
  if (
    draftHas(draft, [
      'department:create',
      'department:update',
      'department:assign_manager',
      'team:create',
      'team:update',
      'team:add_member',
      'team:assign_leader',
    ])
  ) {
    organization.push('write');
  }
  if (draftHas(draft, ['department:delete', 'team:delete', 'team:remove_member'])) {
    organization.push('delete');
  }
  if (organization.length) entries.push({ resource: 'organization', actions: organization });

  const member = [];
  if (draftHas(draft, ['user:view'])) member.push('read');
  if (
    draftHas(draft, [
      'user:create',
      'user:update',
      'user:disable',
      'user:reset_password',
      'user:assign_department',
      'user:assign_team',
    ])
  ) {
    member.push('write');
  }
  if (draftHas(draft, ['user:delete'])) member.push('delete');
  if (member.length) entries.push({ resource: 'organization_member', actions: member });

  const role = [];
  if (draftHas(draft, ['system:view_audit_log'])) role.push('read');
  if (draftHas(draft, ['system:manage_role'])) {
    role.push('write');
    role.push('delete');
  }
  if (draftHas(draft, ['system:manage_permission', 'system:manage_security'])) role.push('admin');
  if (role.length) entries.push({ resource: 'role', actions: [...new Set(role)] });

  return entries;
}

function mergePermissionEntryLists(lists) {
  const grouped = new Map();
  for (const list of lists) {
    for (const p of normalizePermissionEntries(list)) {
      if (!grouped.has(p.resource)) grouped.set(p.resource, new Set());
      for (const a of p.actions) grouped.get(p.resource).add(a);
    }
  }
  return Array.from(grouped.entries())
    .map(([resource, actionsSet]) => ({
      resource,
      actions: Array.from(actionsSet),
    }))
    .filter((p) => p.resource && p.actions.length > 0);
}

/**
 * Persist: catalog keys đã chọn + quyền legacy suy ra (gateway).
 * Giữ luôn cả hai để UI sửa lại / runtime check cùng đúng.
 */
export function permissionEntriesForPersist(draft) {
  // Giữ fine-grained catalog (kể cả task/voice trùng tên với legacy);
  // bỏ draft key kiểu chat:/document: nếu lẫn vào (không thuộc UI catalog).
  const catalog = permissionEntriesFromState(draft).filter(
    (p) => !GATEWAY_ONLY_LEGACY_RESOURCES.has(p.resource)
  );
  const legacy = deriveLegacyEntriesFromCatalogDraft(draft);
  return mergePermissionEntryLists([catalog, legacy]);
}

export function isCatalogPermissionKey(key) {
  return CATALOG_KEY_SET.has(key);
}
