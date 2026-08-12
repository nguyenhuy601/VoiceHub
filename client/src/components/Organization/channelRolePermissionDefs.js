/** Định nghĩa quyền kênh theo vai trò — mỗi kênh lưu riêng (ChannelRoleAccess). */

export const CHANNEL_PERM_KEYS = {
  see: 'canSee',
  read: 'canRead',
  write: 'canWrite',
  delete: 'canDelete',
  voice: 'canVoice',
};

export function emptyChannelRolePermissions() {
  return {
    canSee: false,
    canRead: false,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

/** Mặc định khi thêm vai trò vào kênh: xem kênh + (đọc chat / kết nối voice). */
export function defaultChannelRolePermissions(isVoiceChannel) {
  if (isVoiceChannel) {
    return {
      canSee: true,
      canRead: true,
      canWrite: false,
      canDelete: false,
      canVoice: true,
    };
  }
  return {
    canSee: true,
    canRead: true,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

export function hasAnyChannelRolePermission(permissions) {
  const p = permissions || {};
  return Boolean(p.canSee || p.canRead || p.canWrite || p.canDelete || p.canVoice);
}

function permRow(id, title, description, key) {
  return { id, title, description, key };
}

function tr(t, key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

export function channelPermissionGroups({ isVoiceChannel, t }) {
  const general = [
    permRow(
      'view',
      tr(t, 'organizations.channelPermViewTitle', 'View channel'),
      tr(
        t,
        'organizations.channelPermViewDesc',
        'Allow members with this role to see and open this channel.'
      ),
      CHANNEL_PERM_KEYS.see
    ),
  ];

  const text = [
    permRow(
      'history',
      tr(t, 'organizations.channelPermHistoryTitle', 'View message history'),
      tr(
        t,
        'organizations.channelPermHistoryDesc',
        'Allow reading messages sent in this channel.'
      ),
      CHANNEL_PERM_KEYS.read
    ),
    permRow(
      'send',
      tr(t, 'organizations.channelPermSendTitle', 'Send messages'),
      tr(
        t,
        'organizations.channelPermSendDesc',
        'Allow sending and interacting in this chat channel.'
      ),
      CHANNEL_PERM_KEYS.write
    ),
    permRow(
      'manage',
      tr(t, 'organizations.channelPermManageTitle', 'Manage messages'),
      tr(
        t,
        'organizations.channelPermManageDesc',
        'Allow deleting or moderating messages of other members.'
      ),
      CHANNEL_PERM_KEYS.delete
    ),
  ];

  const voice = [
    permRow(
      'connect',
      tr(t, 'organizations.channelPermConnectTitle', 'Connect'),
      tr(
        t,
        'organizations.channelPermConnectDesc',
        'Allow joining the voice channel and hearing others.'
      ),
      CHANNEL_PERM_KEYS.voice
    ),
  ];

  const groups = [
    { id: 'general', title: tr(t, 'organizations.channelPermGroupGeneral', 'General channel permissions'), items: general },
  ];

  if (isVoiceChannel) {
    groups.push({ id: 'voice', title: tr(t, 'organizations.channelPermGroupVoice', 'Voice channel permissions'), items: voice });
    groups.push({ id: 'text-in-voice', title: tr(t, 'organizations.channelPermGroupTextInVoice', 'Voice channel chat'), items: text });
  } else {
    groups.push({ id: 'text', title: tr(t, 'organizations.channelPermGroupText', 'Message permissions'), items: text });
  }

  return groups;
}

/** Quyền mặc định khi thêm vai trò vào khối / phòng ban (áp dụng kế thừa xuống kênh). */
export function defaultScopeRolePermissions() {
  return {
    canSee: true,
    canRead: true,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

/** Nhóm quyền cho cài đặt khối / phòng ban (mọi loại kênh con). */
export function scopePermissionGroups(t) {
  const general = [
    permRow(
      'view',
      tr(t, 'organizations.scopePermViewTitle', 'View channels'),
      tr(
        t,
        'organizations.scopePermViewDesc',
        'Allow seeing channels in this scope.'
      ),
      CHANNEL_PERM_KEYS.see
    ),
  ];
  const text = [
    permRow(
      'history',
      tr(t, 'organizations.scopePermHistoryTitle', 'View message history'),
      tr(
        t,
        'organizations.scopePermHistoryDesc',
        'Allow reading messages in scoped chat channels.'
      ),
      CHANNEL_PERM_KEYS.read
    ),
    permRow(
      'send',
      tr(t, 'organizations.scopePermSendTitle', 'Send messages'),
      tr(
        t,
        'organizations.scopePermSendDesc',
        'Allow sending messages in scoped chat channels.'
      ),
      CHANNEL_PERM_KEYS.write
    ),
    permRow(
      'manage',
      tr(t, 'organizations.scopePermManageTitle', 'Manage messages'),
      tr(
        t,
        'organizations.scopePermManageDesc',
        'Allow deleting or moderating messages in scoped chat channels.'
      ),
      CHANNEL_PERM_KEYS.delete
    ),
  ];
  const voice = [
    permRow(
      'connect',
      tr(t, 'organizations.scopePermConnectTitle', 'Connect voice'),
      tr(
        t,
        'organizations.scopePermConnectDesc',
        'Allow joining voice channels in this scope.'
      ),
      CHANNEL_PERM_KEYS.voice
    ),
  ];
  return [
    { id: 'general', title: tr(t, 'organizations.scopePermGroupGeneral', 'General permissions'), items: general },
    { id: 'text', title: tr(t, 'organizations.scopePermGroupText', 'Chat channel permissions'), items: text },
    { id: 'voice', title: tr(t, 'organizations.scopePermGroupVoice', 'Voice channel permissions'), items: voice },
  ];
}

/** Bật quyền phụ thuộc (xem kênh → đọc; viết/xóa → đọc). */
export function applyChannelPermissionToggle(prev, key, allowed) {
  const next = { ...prev, [key]: allowed };
  if (key === CHANNEL_PERM_KEYS.see && allowed) {
    next.canRead = true;
  }
  if (key === CHANNEL_PERM_KEYS.see && !allowed) {
    next.canRead = false;
    next.canWrite = false;
    next.canDelete = false;
    next.canVoice = false;
  }
  if (key === CHANNEL_PERM_KEYS.read && !allowed) {
    next.canWrite = false;
    next.canDelete = false;
  }
  if ((key === CHANNEL_PERM_KEYS.write || key === CHANNEL_PERM_KEYS.delete) && allowed) {
    next.canSee = true;
    next.canRead = true;
  }
  if (key === CHANNEL_PERM_KEYS.voice && allowed) {
    next.canSee = true;
  }
  return next;
}

/** Màu nhãn vai trò (sidebar). */
const ROLE_COLORS = [
  '#f23f43',
  '#f0b232',
  '#3ba55d',
  '#5865f2',
  '#eb459e',
  '#57f287',
  '#ed4245',
  '#fee75c',
];

export function roleAccentColor(roleId, index = 0) {
  const s = String(roleId || '');
  let hash = index;
  for (let i = 0; i < s.length; i += 1) hash = (hash + s.charCodeAt(i) * 17) % ROLE_COLORS.length;
  return ROLE_COLORS[hash % ROLE_COLORS.length];
}
