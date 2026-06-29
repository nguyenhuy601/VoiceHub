import { channelUnreadCount, voicePresenceLabel } from '../components/Organization/organizationStructureTheme';
import { displayDepartmentName } from './orgEntityDisplay';
import { channelsForDepartment } from './orgChannelScope';

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || value.userId || '');
  return String(value);
}

function collectDeptTeams(departmentId, { teams = [], branches = [] }) {
  const id = String(departmentId);
  const fromFlat = teams.filter((team) => String(team.department || '') === id);
  if (fromFlat.length) return fromFlat;
  const fromTree = [];
  branches.forEach((branch) => {
    (branch?.divisions || []).forEach((division) => {
      (division?.departments || []).forEach((department) => {
        if (String(department._id || department.id) === id) {
          fromTree.push(...(department.teams || []));
        }
      });
    });
  });
  return fromTree;
}

function collectDeptChannels(departmentId, deptTeams, channels = []) {
  const id = String(departmentId);
  const teamIds = new Set(deptTeams.map((team) => asId(team)));
  return channels.filter((channel) => {
    const chDept = String(channel.department || '');
    const chTeam = String(channel.team || '');
    return chDept === id || (chTeam && teamIds.has(chTeam));
  });
}

function collectMemberIds(department, deptTeams) {
  const ids = new Set();
  (department?.members || []).forEach((member) => {
    const memberId = asId(member);
    if (memberId) ids.add(memberId);
  });
  deptTeams.forEach((team) => {
    (team?.members || []).forEach((member) => {
      const memberId = asId(member);
      if (memberId) ids.add(memberId);
    });
    const leaderId = asId(team?.leader);
    if (leaderId) ids.add(leaderId);
  });
  const headId = asId(department?.head);
  if (headId) ids.add(headId);
  return ids;
}

function resolvePersonName(person) {
  if (!person || typeof person !== 'object') return '';
  return (
    person.displayName ||
    person.name ||
    person.fullName ||
    person.email ||
    ''
  );
}

function resolveHeadName(department, deptTeams) {
  const fromHead = resolvePersonName(department?.head);
  if (fromHead) return fromHead;
  for (const team of deptTeams) {
    const leaderName = resolvePersonName(team?.leader);
    if (leaderName) return leaderName;
  }
  return '';
}

function resolveLastActivity(deptTeams, deptChannels) {
  let best = null;
  [...deptTeams, ...deptChannels].forEach((item) => {
    const ts = new Date(item?.updatedAt || item?.createdAt).getTime();
    if (!Number.isFinite(ts)) return;
    if (!best || ts > best.ts) {
      best = {
        ts,
        label: String(item?.name || item?.slug || '').trim(),
      };
    }
  });
  return best;
}

function resolveActivityLevel({ unread, onlineCount, lastActivityMs }) {
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  if (unread >= 10 || onlineCount >= 5) return 'hot';
  if (unread > 0 || onlineCount > 0 || (lastActivityMs && Date.now() - lastActivityMs < oneDay)) {
    return 'active';
  }
  if (!lastActivityMs || Date.now() - lastActivityMs > threeDays) return 'quiet';
  return 'normal';
}

function resolveDeptRole(departmentId, membershipScope = {}, orgMyRole = '') {
  const deptId = String(departmentId);
  const orgRole = String(orgMyRole || '').toLowerCase();
  if (['owner', 'admin'].includes(orgRole)) return orgRole;
  if (String(membershipScope?.departmentId || '') === deptId) {
    return String(membershipScope?.structureMode || 'member').toLowerCase() || 'member';
  }
  if (membershipScope?.scopedDepartmentIds?.includes(deptId)) return 'member';
  return '';
}

export function formatDeptRelativeTime(raw, t, locale) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('workspace.relNow');
  if (minutes < 60) return t('workspace.relMinutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('workspace.relHoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('workspace.relDaysAgo', { n: days });
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function buildDepartmentHubCard({
  department,
  teams = [],
  branches = [],
  channels = [],
  onlineUserIds = [],
  membershipScope = {},
  orgMyRole = '',
  locale = 'vi',
}) {
  const id = asId(department);
  const rawName = department?.name || 'Phòng ban';
  const name = displayDepartmentName(rawName, locale);
  const deptTeams = collectDeptTeams(id, { teams, branches });
  const deptChannels = collectDeptChannels(id, deptTeams, channels);
  const deptOnlyChannels = channelsForDepartment(channels, id);
  const teamScopedChannels = deptChannels.filter((channel) => String(channel.team || ''));
  const memberIds = collectMemberIds(department, deptTeams);
  const onlineSet = new Set((onlineUserIds || []).map((uid) => String(uid)));
  const onlineCount = [...memberIds].filter((memberId) => onlineSet.has(memberId)).length;
  const deptUnread = deptOnlyChannels.reduce((sum, channel) => sum + channelUnreadCount(channel), 0);
  const teamUnread = teamScopedChannels.reduce((sum, channel) => sum + channelUnreadCount(channel), 0);
  const totalUnread = deptUnread + teamUnread;
  const channelCount = deptChannels.length;
  const teamNames = deptTeams
    .map((team) => String(team?.name || '').trim())
    .filter(Boolean);
  const lastActivity = resolveLastActivity(deptTeams, deptChannels);
  const activityLevel = resolveActivityLevel({
    unread: totalUnread,
    onlineCount,
    lastActivityMs: lastActivity?.ts,
  });
  const deptVoiceChannels = deptOnlyChannels.filter(
    (channel) => String(channel?.type || '').toLowerCase() === 'voice'
  );
  const voiceChannels = deptChannels.filter(
    (channel) => String(channel?.type || '').toLowerCase() === 'voice'
  );
  const deptVoiceLive = deptVoiceChannels.some(
    (channel) => Number(channel?.voiceActiveCount ?? channel?.activeVoiceCount ?? 0) > 0
  );
  const voiceLive = voiceChannels.some(
    (channel) => Number(channel?.voiceActiveCount ?? channel?.activeVoiceCount ?? 0) > 0
  );
  const voiceParticipants = voiceChannels.reduce(
    (sum, channel) => sum + Number(channel?.voiceActiveCount ?? channel?.activeVoiceCount ?? 0),
    0
  );
  const deptVoiceParticipants = deptVoiceChannels.reduce(
    (sum, channel) => sum + Number(channel?.voiceActiveCount ?? channel?.activeVoiceCount ?? 0),
    0
  );
  const activeTasks = deptTeams.reduce(
    (sum, team) => sum + Number(team?.activeTasks ?? team?.taskCount ?? team?.tasksCount ?? 0),
    0
  );

  return {
    id,
    name,
    description: String(department?.description || '').trim(),
    initial: String(name).trim().charAt(0).toUpperCase() || 'P',
    memberCount: memberIds.size,
    onlineCount,
    teamCount: deptTeams.length,
    teamNames,
    channelCount: deptOnlyChannels.length,
    deptOnlyChannelCount: deptOnlyChannels.length,
    channelTags: deptOnlyChannels
      .filter((channel) => String(channel?.type || '').toLowerCase() !== 'voice')
      .slice(0, 3)
      .map((channel) => String(channel?.name || channel?.slug || 'general')),
    deptUnread,
    teamUnread,
    totalUnread,
    unread: deptUnread,
    activeTasks,
    headName: resolveHeadName(department, deptTeams),
    myRole: resolveDeptRole(id, membershipScope, orgMyRole),
    activityLevel,
    lastActivityLabel: lastActivity?.label || '',
    lastActivityAt: lastActivity?.ts ? new Date(lastActivity.ts).toISOString() : '',
    voiceLive,
    deptVoiceLive,
    voiceParticipants,
    deptVoiceParticipants,
    voicePresence: deptVoiceChannels.map((channel) => voicePresenceLabel(channel)).find(Boolean)
      || voiceChannels.map((channel) => voicePresenceLabel(channel)).find(Boolean)
      || '',
    raw: department,
  };
}

export function buildDepartmentHubCards({
  departments = [],
  teams = [],
  branches = [],
  channels = [],
  onlineUserIds = [],
  membershipScope = {},
  orgMyRole = '',
  locale = 'vi',
}) {
  return departments.map((department) =>
    buildDepartmentHubCard({
      department,
      teams,
      branches,
      channels,
      onlineUserIds,
      membershipScope,
      orgMyRole,
      locale,
    })
  );
}
