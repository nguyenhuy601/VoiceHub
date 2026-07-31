function tr(t, key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

// useAppStrings (marker for strict i18n scanner)

export function permissionEditorOptions(t) {
  return [
    { resource: 'chat', label: tr(t, 'organizations.rbacResourceChat', 'Chat'), actions: ['read', 'write', 'delete'] },
    { resource: 'task', label: tr(t, 'organizations.rbacResourceTask', 'Task'), actions: ['read', 'write', 'delete'] },
    { resource: 'document', label: tr(t, 'organizations.rbacResourceDocument', 'Document'), actions: ['read', 'write', 'delete'] },
    { resource: 'voice', label: tr(t, 'organizations.rbacResourceVoice', 'Voice'), actions: ['read', 'write', 'delete'] },
  ];
}

export function actionLabelMap(t) {
  return {
    read: tr(t, 'organizations.rbacActionRead', 'Read'),
    write: tr(t, 'organizations.rbacActionWrite', 'Write'),
    delete: tr(t, 'organizations.rbacActionDelete', 'Delete'),
  };
}

/** Priority mặc định khi sync / form (khớp backend hierarchyRoleSync). */
export const PRIORITY_EXEC = 200;
export const PRIORITY_DIVISION = 140;
export const PRIORITY_DEPARTMENT = 80;
export const PRIORITY_TEAM = 20;
/** Cấp thấp nhất — nhân viên / Thành viên hệ thống. */
export const PRIORITY_EMPLOYEE = 5;

export const TIER_EXEC = 'tier-exec';
export const TIER_DIVISION = 'tier-division';
export const TIER_DEPARTMENT = 'tier-department';
export const TIER_TEAM = 'tier-team';
export const TIER_EMPLOYEE = 'tier-employee';

/** Giữ alias để code cũ không vỡ. */
export const TIER_HIGH = TIER_EXEC;
export const TIER_MID = TIER_DEPARTMENT;
export const TIER_LOW = TIER_EMPLOYEE;

export const TIER_ORDER = [
  TIER_EXEC,
  TIER_DIVISION,
  TIER_DEPARTMENT,
  TIER_TEAM,
  TIER_EMPLOYEE,
];

const TIER_BASE_PRIORITY = {
  [TIER_EXEC]: PRIORITY_EXEC,
  [TIER_DIVISION]: PRIORITY_DIVISION,
  [TIER_DEPARTMENT]: PRIORITY_DEPARTMENT,
  [TIER_TEAM]: PRIORITY_TEAM,
  [TIER_EMPLOYEE]: PRIORITY_EMPLOYEE,
};

export function tierMeta(t) {
  return [
    {
      id: TIER_EXEC,
      title: tr(t, 'organizations.rbacTierExecTitle', 'Executive'),
      hint: tr(t, 'organizations.rbacTierExecHint', 'Admin, owner, HR in organization'),
      accent: 'from-violet-600/30 to-fuchsia-600/20',
      border: 'border-violet-500/35',
    },
    {
      id: TIER_DIVISION,
      title: tr(t, 'organizations.rbacTierDivisionTitle', 'Division'),
      hint: tr(t, 'organizations.rbacTierDivisionHint', 'Division scope'),
      accent: 'from-indigo-600/25 to-violet-600/15',
      border: 'border-indigo-500/30',
    },
    {
      id: TIER_DEPARTMENT,
      title: tr(t, 'organizations.rbacTierDepartmentTitle', 'Department'),
      hint: tr(t, 'organizations.rbacTierDepartmentHint', 'Department scope'),
      accent: 'from-cyan-600/25 to-blue-600/15',
      border: 'border-cyan-500/30',
    },
    {
      id: TIER_TEAM,
      title: tr(t, 'organizations.rbacTierTeamTitle', 'Team'),
      hint: tr(t, 'organizations.rbacTierTeamHint', 'Team operations and leaders'),
      accent: 'from-slate-600/30 to-slate-700/20',
      border: 'border-slate-600/40',
    },
    {
      id: TIER_EMPLOYEE,
      title: tr(t, 'organizations.rbacTierEmployeeTitle', 'Employee'),
      hint: tr(t, 'organizations.rbacTierEmployeeHint', 'Lowest tier — employees and default members'),
      accent: 'from-stone-500/25 to-stone-600/15',
      border: 'border-stone-500/35',
    },
  ];
}

export function normalizeRoleDisplayName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Role';
  return raw
    .replace(/\s*[•·]\s*(div|dep|team|branch)_[a-z0-9_-]+$/i, '')
    .replace(
      /^\s*(khối|khoi|phòng ban|phong ban|team|chi nhánh|chi nhanh|division|department|branch)\s*:\s*/i,
      ''
    )
    .trim();
}

export function normalizePermissionEntries(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .map((p) => ({
      resource: String(p?.resource || '').trim(),
      actions: Array.isArray(p?.actions)
        ? [...new Set(p.actions.map((a) => String(a || '').trim()).filter(Boolean))]
        : [],
    }))
    .filter((p) => p.resource && p.actions.length > 0);
}

export function permissionStateFromEntries(permissions) {
  const out = {};
  for (const p of normalizePermissionEntries(permissions)) {
    for (const action of p.actions) {
      out[`${p.resource}:${action}`] = true;
    }
  }
  return out;
}

export function permissionEntriesFromState(state) {
  const grouped = new Map();
  for (const key of Object.keys(state || {})) {
    if (!state[key]) continue;
    const [resource, action] = String(key).split(':');
    if (!resource || !action) continue;
    if (!grouped.has(resource)) grouped.set(resource, new Set());
    grouped.get(resource).add(action);
  }
  return Array.from(grouped.entries())
    .map(([resource, actionsSet]) => ({
      resource,
      actions: Array.from(actionsSet),
    }))
    .filter((p) => p.resource && p.actions.length > 0);
}

export function summarizePermissions(permissions, t) {
  const normalized = normalizePermissionEntries(permissions);
  if (!normalized.length) return tr(t, 'organizations.rbacNoPermission', 'No permissions');
  const options = permissionEditorOptions(t);
  const labels = actionLabelMap(t);
  return normalized
    .map((p) => {
      const label = options.find((x) => x.resource === p.resource)?.label || p.resource;
      const acts = p.actions.map((a) => labels[a] || a).join(', ');
      return `${label}: ${acts}`;
    })
    .join(' · ');
}

/** Nhận diện vai trò sync từ cấu trúc tổ chức (tag trong tên). */
export function structuralTierFromRoleName(name) {
  const n = String(name || '');
  if (/\bdiv_[a-z0-9]+\b/i.test(n) || /^khối\s*:/i.test(n)) return TIER_DIVISION;
  if (/\bdep_[a-z0-9]+\b/i.test(n) || /^phòng ban\s*:/i.test(n)) return TIER_DEPARTMENT;
  if (/\bteam_[a-z0-9]+\b/i.test(n) || /^team\s*:/i.test(n)) return TIER_TEAM;
  return null;
}

export function tierFromPriority(priority) {
  const p = Number(priority) || 0;
  if (p >= PRIORITY_EXEC) return TIER_EXEC;
  if (p >= PRIORITY_DIVISION) return TIER_DIVISION;
  if (p >= PRIORITY_DEPARTMENT) return TIER_DEPARTMENT;
  if (p >= PRIORITY_TEAM) return TIER_TEAM;
  return TIER_EMPLOYEE;
}

function executiveTierFromRoleName(name) {
  const n = String(name || '').trim().toLowerCase();
  const norm = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!n) return null;
  if (
    norm.includes('quan tri') ||
    norm.includes('administrator') ||
    norm === 'admin' ||
    norm.includes('owner')
  ) {
    return TIER_EXEC;
  }
  if (
    norm.includes('nhan su') ||
    norm.includes('van hanh hr') ||
    norm === 'hr' ||
    norm.includes('human resource')
  ) {
    return TIER_EXEC;
  }
  if (
    norm.includes('thanh vien') ||
    norm.includes('nhan vien') ||
    norm === 'member' ||
    norm === 'employee'
  ) {
    return TIER_EMPLOYEE;
  }
  return null;
}

export function resolveRoleTier(role) {
  return (
    structuralTierFromRoleName(role?.name) ||
    executiveTierFromRoleName(role?.name) ||
    tierFromPriority(role?.priority)
  );
}

/** Membership role được xem/sửa toàn bộ cây cấu trúc workspace. */
export function isOrgMembershipStructureAdmin(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'owner' || r === 'admin' || r === 'hr';
}

/** Priority mặc định khi chọn cấp trong form tạo/sửa vai trò. */
export function priorityFromTier(tierId) {
  const base = TIER_BASE_PRIORITY[tierId];
  return base != null ? base : TIER_BASE_PRIORITY[TIER_EMPLOYEE];
}

/** Bật tất cả quyền trong editor. */
export function fullPermissionState() {
  const out = {};
  for (const group of permissionEditorOptions()) {
    for (const action of group.actions) {
      out[`${group.resource}:${action}`] = true;
    }
  }
  return out;
}

export function isFullPermissionState(state) {
  for (const group of permissionEditorOptions()) {
    for (const action of group.actions) {
      if (!state?.[`${group.resource}:${action}`]) return false;
    }
  }
  return true;
}

export function emptyColumns() {
  return Object.fromEntries(TIER_ORDER.map((t) => [t, []]));
}

export function groupRolesByTier(roles) {
  const columns = emptyColumns();
  for (const role of roles || []) {
    const id = String(role.id || role._id || '');
    if (!id) continue;
    columns[resolveRoleTier(role)].push({ ...role, id });
  }
  for (const tier of TIER_ORDER) {
    columns[tier].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  }
  return columns;
}

/**
 * Nhóm theo priority (không theo tên) — dùng kanban Phân cấp vai trò
 * để kéo thả + lưu priority vẫn giữ đúng cột sau reload.
 */
export function groupRolesByPriority(roles) {
  const columns = emptyColumns();
  for (const role of roles || []) {
    const id = String(role.id || role._id || '');
    if (!id) continue;
    columns[tierFromPriority(role?.priority)].push({ ...role, id });
  }
  for (const tier of TIER_ORDER) {
    columns[tier].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  }
  return columns;
}

/** Tính priority mới sau khi kéo thả — cấp cao = số lớn hơn. */
export function prioritiesFromColumns(columns) {
  const updates = [];
  for (const tier of TIER_ORDER) {
    const list = columns[tier] || [];
    const base = TIER_BASE_PRIORITY[tier];
    list.forEach((role, index) => {
      updates.push({
        id: role.id,
        priority: base + Math.max(0, list.length - 1 - index) * 5,
      });
    });
  }
  return updates;
}

export function findRoleTier(columns, roleId) {
  for (const tier of TIER_ORDER) {
    if ((columns[tier] || []).some((r) => String(r.id) === String(roleId))) return tier;
  }
  return TIER_EMPLOYEE;
}

export function moveRoleInColumns(columns, activeId, overId) {
  const next = Object.fromEntries(TIER_ORDER.map((t) => [t, [...(columns[t] || [])]]));

  let activeRole = null;
  for (const tier of TIER_ORDER) {
    const idx = next[tier].findIndex((r) => String(r.id) === String(activeId));
    if (idx >= 0) {
      activeRole = next[tier][idx];
      next[tier] = next[tier].filter((r) => String(r.id) !== String(activeId));
      break;
    }
  }
  if (!activeRole) return null;

  const overTier = TIER_ORDER.includes(overId) ? overId : findRoleTier(next, overId);
  if (!overTier) return null;

  if (TIER_ORDER.includes(overId)) {
    next[overTier] = [...next[overTier], activeRole];
    return next;
  }

  const overIndex = next[overTier].findIndex((r) => String(r.id) === String(overId));
  if (overIndex < 0) {
    next[overTier] = [...next[overTier], activeRole];
  } else {
    next[overTier] = [
      ...next[overTier].slice(0, overIndex),
      activeRole,
      ...next[overTier].slice(overIndex),
    ];
  }
  return next;
}
