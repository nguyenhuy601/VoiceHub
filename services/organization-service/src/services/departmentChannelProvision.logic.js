const DEFAULT_DEPT_CHANNEL_DEFS = [
  {
    name: 'announcements',
    description: 'Department official announcements',
    type: 'announcement',
  },
];

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDeptChannelSeed({ organizationId, branchId, divisionId, departmentId, leaderId }, def) {
  return {
    name: def.name,
    description: def.description,
    type: def.type,
    organization: organizationId,
    branch: branchId || null,
    division: divisionId || null,
    department: departmentId,
    team: null,
    leader: leaderId || null,
    isActive: true,
  };
}

function buildExistingDefaultChannelQuery(organizationId, deptId, def) {
  const nameRe = new RegExp(`^${escapeRegex(def.name)}$`, 'i');
  return {
    organization: organizationId,
    department: deptId,
    team: null,
    isActive: true,
    $or: [{ type: def.type }, { name: nameRe }],
  };
}

/** Kênh announce mặc định phòng (theo type hoặc tên seed). */
function isDepartmentDefaultAnnounceChannel(channel, def = DEFAULT_DEPT_CHANNEL_DEFS[0]) {
  if (!channel || String(channel.team || '')) return false;
  if (!channel.department) return false;
  if (channel.projectId) return false;
  const type = String(channel.type || '').toLowerCase();
  const name = String(channel.name || '').trim().toLowerCase();
  const defType = String(def.type || 'announcement').toLowerCase();
  const defName = String(def.name || 'announcements').trim().toLowerCase();
  return type === defType || name === defName;
}

/**
 * Giữ 1 kênh announce / phòng (bản cũ nhất). Trả Set id cần giữ.
 */
function selectDepartmentAnnounceKeepers(channels, def = DEFAULT_DEPT_CHANNEL_DEFS[0]) {
  const byDept = new Map();
  for (const channel of channels || []) {
    if (!isDepartmentDefaultAnnounceChannel(channel, def)) continue;
    if (channel.isActive === false) continue;
    const deptKey = String(channel.department || '');
    if (!deptKey) continue;
    const list = byDept.get(deptKey) || [];
    list.push(channel);
    byDept.set(deptKey, list);
  }

  const keepers = new Set();
  for (const list of byDept.values()) {
    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a._id || '').localeCompare(String(b._id || ''));
    });
    const keep = list[0];
    if (keep?._id) keepers.add(String(keep._id));
  }
  return keepers;
}

module.exports = {
  DEFAULT_DEPT_CHANNEL_DEFS,
  escapeRegex,
  buildDeptChannelSeed,
  buildExistingDefaultChannelQuery,
  isDepartmentDefaultAnnounceChannel,
  selectDepartmentAnnounceKeepers,
};
