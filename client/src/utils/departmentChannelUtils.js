import { channelsForDepartment, channelsForTeam, splitChatVoiceChannels } from './orgChannelScope';

function isReadableChannel(ch, permissionMatrix = null) {
  if (!ch?._id) return false;
  const matrix = permissionMatrix && typeof permissionMatrix === 'object' ? permissionMatrix : null;
  if (!matrix || !Object.keys(matrix).length) return true;
  const row = matrix[String(ch._id)] || {};
  return Boolean(row.canSee ?? row.canRead);
}

/** Kênh team trong phòng ban (có team id). */
export function channelsForDepartmentTeams(channels, departmentId, teams = []) {
  const deptId = String(departmentId || '');
  const teamIds = new Set(
    (teams || [])
      .filter((team) => String(team.department || '') === deptId)
      .map((team) => String(team._id || team.id || ''))
      .filter(Boolean)
  );
  return (channels || []).filter((ch) => {
    const chTeam = String(ch.team || '');
    return chTeam && teamIds.has(chTeam);
  });
}

export function splitDeptVsTeamChannels(channels, departmentId, teams = []) {
  const deptOnly = channelsForDepartment(channels, departmentId);
  const teamScoped = channelsForDepartmentTeams(channels, departmentId, teams);
  return { deptOnly, teamScoped, all: [...deptOnly, ...teamScoped] };
}

export function findDeptChannelByType(channels, departmentId, type = 'chat') {
  const deptId = String(departmentId || '');
  const isVoice = String(type || 'chat').toLowerCase() === 'voice';
  const pool = channelsForDepartment(channels, deptId).filter((ch) => {
    const chType = String(ch.type || 'chat').toLowerCase();
    return isVoice ? chType === 'voice' : chType !== 'voice';
  });
  const preferredName = isVoice ? 'voice' : 'general';
  const named = pool.find((ch) => String(ch.name || '').toLowerCase() === preferredName);
  if (named?._id) return named;
  return pool[0] || null;
}

export function resolveDeptChatChannelId(
  channels,
  departmentId,
  permissionMatrix = null
) {
  const { chat } = splitChatVoiceChannels(channelsForDepartment(channels, departmentId));
  const readable = chat.filter((ch) => isReadableChannel(ch, permissionMatrix));
  const general = readable.find((ch) => String(ch.name || '').toLowerCase() === 'general');
  if (general?._id) return String(general._id);
  const first = readable[0];
  return first?._id ? String(first._id) : '';
}

export function resolveDeptVoiceChannelId(
  channels,
  departmentId,
  permissionMatrix = null
) {
  const { voice } = splitChatVoiceChannels(channelsForDepartment(channels, departmentId));
  const readable = voice.filter((ch) => {
    if (!isReadableChannel(ch, permissionMatrix)) return false;
    if (!permissionMatrix || !Object.keys(permissionMatrix).length) return true;
    const row = permissionMatrix[String(ch._id)] || {};
    return row.canVoice !== false;
  });
  const named = readable.find((ch) => String(ch.name || '').toLowerCase() === 'voice');
  if (named?._id) return String(named._id);
  const first = readable[0];
  return first?._id ? String(first._id) : '';
}

export function preferDefaultTextChannelId(
  channelList,
  {
    preferredTeamId = '',
    preferredDepartmentId = '',
    permissionMatrix = null,
    deptOnly = false,
  } = {}
) {
  const list = Array.isArray(channelList) ? channelList : [];
  const matrix =
    permissionMatrix && typeof permissionMatrix === 'object' ? permissionMatrix : null;
  const matrixReady = matrix && Object.keys(matrix).length > 0;
  const isReadable = (ch) => {
    if (!matrixReady) return true;
    const row = matrix[String(ch._id)] || {};
    return Boolean(row.canSee ?? row.canRead);
  };
  const pool = list.filter(isReadable);

  if (deptOnly && preferredDepartmentId) {
    const deptId = resolveDeptChatChannelId(pool, preferredDepartmentId, matrix);
    return deptId || '';
  }

  if (preferredTeamId && !deptOnly) {
    const teamScoped = pool.filter(
      (ch) => String(ch.team || '') === String(preferredTeamId)
    );
    const teamText = teamScoped.find((ch) => String(ch.type || 'text').toLowerCase() !== 'voice');
    if (teamText?._id) return String(teamText._id);
  }

  if (preferredDepartmentId) {
    const deptId = resolveDeptChatChannelId(pool, preferredDepartmentId, matrix);
    if (deptId) return deptId;
  }

  const anyText = pool.find((ch) => String(ch.type || 'text').toLowerCase() !== 'voice');
  return anyText?._id ? String(anyText._id) : '';
}

export { channelsForTeam };
