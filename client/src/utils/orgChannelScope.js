/**
 * Project chat channels — tách khỏi cây org structure.
 */

export function isProjectScopedChannel(channel) {
  return Boolean(channel?.projectId);
}

export function isOrgStructureChannel(channel) {
  return !isProjectScopedChannel(channel);
}

export function isProtectedDefaultChannel(channel) {
  if (!channel) return true;
  if (isProjectScopedChannel(channel)) return false;
  const name = String(channel.name || '').trim().toLowerCase();
  const type = String(channel.type || 'chat').trim().toLowerCase();
  if (type === 'voice') return name === 'voice';
  return name === 'general';
}

/** Kênh gắn team cụ thể (dedupe theo `_id`) — chỉ org structure team channels. */
export function channelsForTeam(channels, teamId) {
  const seen = new Set();
  return (channels || []).filter((ch) => {
    if (isProjectScopedChannel(ch)) return false;
    if (String(ch.team || '') !== String(teamId)) return false;
    const id = String(ch._id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Kênh chung phòng ban (department có, team null) */
export function channelsForDepartment(channels, departmentId) {
  const seen = new Set();
  return (channels || []).filter((ch) => {
    if (isProjectScopedChannel(ch)) return false;
    if (
      String(ch.department || '') !== String(departmentId) ||
      String(ch.team || '')
    ) {
      return false;
    }
    const id = String(ch._id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function isDeptOnlyChannel(channel) {
  return Boolean(channel?.department) && !String(channel?.team || '') && !isProjectScopedChannel(channel);
}

/**
 * Kênh theo ngữ cảnh workspace org (loại project channels).
 */
export function resolveScopedWorkspaceChannels(
  channels,
  { teamId = '', departmentId = '', departmentOnly = false } = {}
) {
  const list = (Array.isArray(channels) ? channels : []).filter(isOrgStructureChannel);
  const team = String(teamId || '');
  const dept = String(departmentId || '');
  if (team && !departmentOnly) {
    return channelsForTeam(list, team);
  }
  if (dept) return channelsForDepartment(list, dept);
  return list;
}

/** Kênh chung khối (division có, department & team null) */
export function channelsForDivision(channels, divisionId) {
  return (channels || []).filter(
    (ch) =>
      isOrgStructureChannel(ch) &&
      String(ch.division || '') === String(divisionId) &&
      !String(ch.department || '') &&
      !String(ch.team || '')
  );
}

export function splitChatVoiceChannels(list) {
  const arr = Array.isArray(list) ? list : [];
  return {
    chat: arr.filter((c) => String(c.type || 'chat').toLowerCase() !== 'voice'),
    voice: arr.filter((c) => String(c.type || '').toLowerCase() === 'voice'),
  };
}

const PROJECT_KIND_ORDER = Object.freeze({
  general: 0,
  announcement: 1,
  cross_team: 2,
  team: 3,
});

export function projectChannelDisplayLabel(channel, t) {
  const kind = String(channel?.projectChannelKind || '').trim();
  if (kind === 'general') return t('orgPanel.projectChannelGeneral');
  if (kind === 'announcement') return t('orgPanel.projectChannelAnnouncement');
  if (kind === 'cross_team') return t('orgPanel.projectChannelCrossTeam');
  if (kind === 'team') {
    const teamName = String(channel?.projectTeamName || channel?.name || '').trim();
    return teamName || t('orgPanel.projectChannelTeam');
  }
  return String(channel?.name || '');
}

export function groupProjectChannelsByProject(channels) {
  const map = new Map();
  for (const ch of channels || []) {
    if (!isProjectScopedChannel(ch)) continue;
    const pid = String(ch.projectId || '');
    if (!pid) continue;
    if (!map.has(pid)) {
      map.set(pid, {
        projectId: pid,
        projectName: String(ch.projectName || pid),
        channels: [],
      });
    }
    map.get(pid).channels.push(ch);
  }
  const groups = [...map.values()];
  for (const group of groups) {
    group.channels.sort((a, b) => {
      const ka = PROJECT_KIND_ORDER[String(a.projectChannelKind || '')] ?? 9;
      const kb = PROJECT_KIND_ORDER[String(b.projectChannelKind || '')] ?? 9;
      if (ka !== kb) return ka - kb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  groups.sort((a, b) => String(a.projectName || '').localeCompare(String(b.projectName || '')));
  return groups;
}

/**
 * Lọc cây workspace theo phạm vi role hierarchy (thu hẹp dần: team → phòng → khối).
 */
export function filterWorkspaceStructureByScope(branches, scope) {
  if (!scope || scope.canSeeAllStructure) return Array.isArray(branches) ? branches : [];
  const scopedDivs = new Set((scope.scopedDivisionIds || []).map(String));
  const scopedDepts = new Set((scope.scopedDepartmentIds || []).map(String));
  const scopedTeams = new Set((scope.scopedTeamIds || []).map(String));
  const structureMode = String(scope.structureMode || 'none');
  if (!scopedDivs.size && !scopedDepts.size && !scopedTeams.size) return [];

  return (branches || [])
    .map((branch) => {
      const nextDivisions = (branch?.divisions || [])
        .map((division) => {
          const divId = String(division._id);
          const allDepartments = Array.isArray(division.departments) ? division.departments : [];

          if (structureMode === 'division' && scopedDivs.has(divId)) {
            return {
              ...division,
              departments: allDepartments.map((dept) => ({
                ...dept,
                teams: Array.isArray(dept.teams) ? dept.teams : [],
              })),
            };
          }

          const departments = allDepartments
            .map((dept) => {
              const deptId = String(dept._id);
              const allTeams = Array.isArray(dept.teams) ? dept.teams : [];

              if (structureMode === 'department' && scopedDepts.has(deptId)) {
                return { ...dept, teams: allTeams };
              }
              if (structureMode === 'team') {
                const teamsFiltered = allTeams.filter((team) =>
                  scopedTeams.has(String(team._id))
                );
                if (!teamsFiltered.length) return null;
                return { ...dept, teams: teamsFiltered };
              }

              const teamsInScope = allTeams.filter((team) =>
                scopedTeams.has(String(team._id))
              );
              if (scopedDepts.has(deptId)) {
                return {
                  ...dept,
                  teams: teamsInScope.length ? teamsInScope : allTeams,
                };
              }
              if (teamsInScope.length) {
                return { ...dept, teams: teamsInScope };
              }
              return null;
            })
            .filter(Boolean);

          if (!departments.length) return null;
          return { ...division, departments };
        })
        .filter(Boolean);
      if (!nextDivisions.length) return null;
      return { ...branch, divisions: nextDivisions };
    })
    .filter(Boolean);
}

/** Gộp danh sách kênh theo _id (ưu tiên bản đầu) */
export function mergeChannelsById(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const ch of list || []) {
      const id = String(ch?._id || ch?.id || '');
      if (!id || byId.has(id)) continue;
      byId.set(id, ch);
    }
  }
  return [...byId.values()];
}

export function preferDefaultTextChannelId(
  channels,
  teamId,
  matrix,
  departmentId,
  departmentOnly = false
) {
  const scoped = resolveScopedWorkspaceChannels(channels, {
    teamId,
    departmentId,
    departmentOnly,
  });
  const matrixReady = matrix && Object.keys(matrix).length > 0;
  const readable = scoped.filter((ch) => {
    if (String(ch.type || '').toLowerCase() === 'voice') return false;
    if (!matrixReady) return true;
    const perm = matrix[String(ch._id)] || {};
    return Boolean(perm.canSee || perm.canRead);
  });
  const general = readable.find((ch) => /^general$/i.test(String(ch.name || '')));
  if (general?._id) return String(general._id);
  const first = readable[0];
  return first?._id ? String(first._id) : '';
}

export function divisionChannelsFromStructure(branches, divisionId) {
  const divId = String(divisionId || '');
  if (!divId || !Array.isArray(branches)) return [];
  for (const branch of branches) {
    for (const division of branch?.divisions || []) {
      if (String(division._id) === divId) {
        return (division.channels || []).filter(isOrgStructureChannel);
      }
    }
  }
  return [];
}

export function findDeptChannelByType(channels, deptId, type) {
  const t = String(type || '').toLowerCase();
  return (channels || []).find(
    (ch) =>
      isOrgStructureChannel(ch) &&
      String(ch.department || '') === String(deptId) &&
      !String(ch.team || '') &&
      String(ch.type || 'chat').toLowerCase() === t
  );
}

export function resolveDeptAnnouncementChannelId(channels, deptId, matrix) {
  const announcement = findDeptChannelByType(channels, deptId, 'announcement');
  if (announcement?._id) return String(announcement._id);
  const general = findDeptChannelByType(channels, deptId, 'chat');
  if (general?._id) {
    const perm = matrix?.[String(general._id)];
    const matrixReady = matrix && Object.keys(matrix).length > 0;
    if (!matrixReady || perm?.canRead || perm?.canSee) return String(general._id);
  }
  return '';
}
