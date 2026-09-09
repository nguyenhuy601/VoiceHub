/**
 * Project Chat channel flags + ACL helpers (pure).
 * Channel = Where+Who; không dùng structureVisibility org cho kênh có projectId.
 */

const PROJECT_CHANNEL_KINDS = Object.freeze(['general', 'announcement', 'cross_team', 'team', 'workgroup']);

const HIDDEN_PERMS = Object.freeze({
  canSee: false,
  canRead: false,
  canWrite: false,
  canDelete: false,
  canVoice: false,
});

function isProjectChatChannelsEnabled() {
  const raw = String(process.env.PROJECT_CHAT_CHANNELS ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function isProjectScopedChannel(channel) {
  return Boolean(channel?.projectId);
}

function projectChannelKindOf(channel) {
  return String(channel?.projectChannelKind || '').trim();
}

function isAnnouncementWriter(channel, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  if (String(channel?.leader || '') === uid || String(channel?.leader?._id || '') === uid) {
    return true;
  }
  const members = Array.isArray(channel?.members) ? channel.members : [];
  return members.some((m) => String(m) === uid || String(m?._id || m) === uid);
}

/**
 * ACL cổng dự án ∩ kind. Trả null nếu không phải project channel (caller dùng org path).
 *
 * @param {{
 *   channel: object,
 *   userId: string,
 *   isProjectMember: boolean,
 *   isInOrgTeam: boolean,
 * }} input
 */
function resolveProjectChannelPermissions({
  channel,
  userId,
  isProjectMember,
  isInOrgTeam,
}) {
  if (!isProjectScopedChannel(channel)) return null;
  if (!isProjectChatChannelsEnabled()) return { ...HIDDEN_PERMS };
  if (!isProjectMember) return { ...HIDDEN_PERMS };

  const kind = projectChannelKindOf(channel);
  if (kind === 'team' && !isInOrgTeam) return { ...HIDDEN_PERMS };

  if (kind === 'workgroup') {
    const isMember = isAnnouncementWriter(channel, userId);
    if (!isMember) return { ...HIDDEN_PERMS };
    return { canSee: true, canRead: true, canWrite: true, canDelete: false, canVoice: false };
  }

  const announcement = kind === 'announcement' || String(channel?.type || '') === 'announcement';
  const canWrite = announcement ? isAnnouncementWriter(channel, userId) : true;
  return {
    canSee: true,
    canRead: true,
    canWrite,
    canDelete: false,
    canVoice: false,
  };
}

function serializeProjectChannel(channel) {
  if (!channel) return null;
  const id = String(channel._id || '');
  if (!id) return null;
  return {
    _id: id,
    name: String(channel.name || ''),
    type: String(channel.type || 'chat').toLowerCase(),
    projectId: String(channel.projectId || ''),
    projectChannelKind: projectChannelKindOf(channel),
    projectName: String(channel.projectName || ''),
    team: channel.team ? String(channel.team) : null,
    projectTeamName: String(channel.projectTeamName || ''),
    leader: channel.leader ? String(channel.leader._id || channel.leader) : null,
  };
}

module.exports = {
  PROJECT_CHANNEL_KINDS,
  HIDDEN_PERMS,
  isProjectChatChannelsEnabled,
  isProjectScopedChannel,
  projectChannelKindOf,
  isAnnouncementWriter,
  resolveProjectChannelPermissions,
  serializeProjectChannel,
};
