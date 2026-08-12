/**
 * Huy: Parent bắt buộc khi tạo đơn vị — theo levels đã setup (khớp template).
 * Chỉ đòi parent khi cả tầng con và tầng cha đều enabled trong schema.
 */

function enabledKeySet(levels) {
  return new Set(
    (Array.isArray(levels) ? levels : [])
      .filter((l) => l && l.enabled !== false && l.key)
      .map((l) => String(l.key).toLowerCase().trim())
  );
}

/**
 * @param {Array<{ key?: string, enabled?: boolean }>|string[]|Set<string>} levelsOrKeys
 * @returns {{ divisionParent: 'branch'|null, departmentParent: 'division'|null, teamParent: 'department'|'division'|null }}
 */
export function resolveOrgUnitCreateParents(levelsOrKeys) {
  let enabled;
  if (levelsOrKeys instanceof Set) {
    enabled = new Set([...levelsOrKeys].map((k) => String(k).toLowerCase().trim()));
  } else if (Array.isArray(levelsOrKeys) && typeof levelsOrKeys[0] === 'string') {
    enabled = new Set(levelsOrKeys.map((k) => String(k).toLowerCase().trim()));
  } else {
    enabled = enabledKeySet(levelsOrKeys);
  }

  return {
    divisionParent: enabled.has('division') && enabled.has('branch') ? 'branch' : null,
    departmentParent: enabled.has('department') && enabled.has('division') ? 'division' : null,
    teamParent: !enabled.has('team')
      ? null
      : enabled.has('department')
        ? 'department'
        : enabled.has('division')
          ? 'division'
          : null,
  };
}

export default resolveOrgUnitCreateParents;
