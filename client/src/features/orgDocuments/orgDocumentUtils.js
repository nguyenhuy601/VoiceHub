/** @typedef {'channel_chat'|'channel_voice'|'voice_meeting'|'announcement'|'library'|'image'|'all'} OrgFileCategory */

export const ORG_FILE_CATEGORIES = [
  { id: 'all', icon: '📂' },
  { id: 'shared', icon: '📎' },
  { id: 'channel_chat', icon: '💬' },
  { id: 'channel_voice', icon: '🎙️' },
  { id: 'voice_meeting', icon: '📞' },
  { id: 'announcement', icon: '📢' },
  { id: 'library', icon: '📚' },
  { id: 'image', icon: '🖼️' },
];

/** Shared Files facet = library + announcement. */
export function isSharedFilesCategory(category) {
  const c = String(category || '').toLowerCase();
  return c === 'library' || c === 'announcement';
}

export function unwrapApiPayload(payload) {
  return payload?.data !== undefined ? payload.data : payload;
}

export function decodeFileNameCandidate(raw) {
  let out = String(raw || '').trim();
  if (!out) return '';
  out = out.replace(/\+/g, ' ');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(out)) break;
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out.trim();
}

export function attachmentDisplayName(message, fallback) {
  const fm = message?.fileMeta;
  const fromMeta = decodeFileNameCandidate(fm?.originalName);
  if (fromMeta) return fromMeta;
  const signed = String(message?.signedReadUrl || message?.readUrl || '').trim();
  if (signed) {
    try {
      const u = new URL(signed);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const decoded = decodeFileNameCandidate(last);
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  const content = String(message?.content || '');
  if (/^https?:\/\//i.test(content)) {
    try {
      const u = new URL(content);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const decoded = decodeFileNameCandidate(last);
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ghép meta Drive file → attachment ref (storagePath / url) để mở giống task board. */
export function toDriveAttachmentRef(file) {
  if (!file || typeof file !== 'object') return null;
  const raw = file.raw && typeof file.raw === 'object' ? file.raw : {};
  const fileMeta = raw.fileMeta && typeof raw.fileMeta === 'object' ? raw.fileMeta : {};
  const url = String(
    file.url || raw.url || fileMeta.storagePath || fileMeta.url || ''
  ).trim();
  const storagePath = String(
    file.storagePath || raw.storagePath || fileMeta.storagePath || ''
  ).trim();
  return {
    ...raw,
    name: file.name || raw.name || fileMeta.originalName,
    url: url || storagePath,
    storagePath: storagePath || (url && !/^https?:\/\//i.test(url) ? url : ''),
    documentId: file.documentId || raw.documentId || fileMeta.documentId,
    mimeType: file.mimeType || raw.mimeType || fileMeta.mimeType || raw.contentType,
  };
}

/** URL mở được trên Drive (file đính kèm / thư viện / project attachment). */
export function resolveOrgFileOpenUrl(file) {
  if (!file || typeof file !== 'object') return '';
  const raw = file.raw && typeof file.raw === 'object' ? file.raw : {};
  const fileMeta = raw.fileMeta && typeof raw.fileMeta === 'object' ? raw.fileMeta : {};
  const candidates = [
    file.url,
    file.fileUrl,
    file.downloadUrl,
    file.signedReadUrl,
    file.readUrl,
    raw.url,
    raw.fileUrl,
    raw.downloadUrl,
    raw.signedReadUrl,
    raw.readUrl,
    raw.content,
    fileMeta.url,
    fileMeta.signedReadUrl,
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (!s) continue;
    if (/^https?:\/\//i.test(s) || s.startsWith('blob:') || s.startsWith('data:')) return s;
    // Relative same-origin (upload path)
    if (s.startsWith('/') && !s.startsWith('//')) return s;
  }
  return '';
}

function resolveDocByteSize(doc) {
  const candidates = [doc?.fileSize, doc?.byteSize, doc?.size, doc?.fileMeta?.byteSize];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function mimeToLabel(mimeType, messageType) {
  const mt = String(mimeType || '').toLowerCase();
  const msgT = String(messageType || '').toLowerCase();
  if (msgT === 'image' || mt.startsWith('image/')) return 'IMG';
  if (mt.includes('pdf')) return 'PDF';
  if (mt.includes('sheet') || mt.includes('excel')) return 'XLS';
  if (mt.includes('word') || mt.includes('document')) return 'DOC';
  if (mt.includes('zip') || mt.includes('archive')) return 'ZIP';
  if (mt.includes('video')) return 'VID';
  if (mt.includes('audio')) return 'AUD';
  return '📄';
}

/**
 * Gom mọi kênh từ cây structure GET /organizations/:id/structure
 */
function toIdSet(ids) {
  if (ids instanceof Set) return ids;
  return new Set((ids || []).map(String).filter(Boolean));
}

export function flattenChannelsFromStructure(branches) {
  const list = [];
  const pushChannels = (channels, meta = {}) => {
    const departmentId = String(meta.departmentId || '').trim();
    const teamId = String(meta.teamId || '').trim();
    for (const ch of channels || []) {
      const id = String(ch?._id || ch?.id || '').trim();
      if (!id) continue;
      list.push({
        _id: id,
        id,
        name: String(ch?.name || ch?.title || id),
        type: String(ch?.type || 'chat').toLowerCase(),
        department: String(ch?.department || ch?.departmentId || departmentId),
        departmentId: String(ch?.department || ch?.departmentId || departmentId),
        team: String(ch?.team || ch?.teamId || teamId),
        teamId: String(ch?.team || ch?.teamId || teamId),
      });
    }
  };

  for (const branch of branches || []) {
    for (const division of branch?.divisions || []) {
      pushChannels(division?.channels);
      for (const department of division?.departments || []) {
        const departmentId = String(department?._id || department?.id || '').trim();
        pushChannels(department?.channels, { departmentId, teamId: '' });
        for (const team of department?.teams || []) {
          const teamId = String(team?._id || team?.id || '').trim();
          pushChannels(team?.channels, { departmentId, teamId });
        }
      }
    }
  }

  const byId = new Map();
  for (const ch of list) {
    if (!byId.has(ch._id)) byId.set(ch._id, ch);
  }
  return Array.from(byId.values());
}

/**
 * @param {object} message — tin nhắn có fileMeta
 * @param {Map<string, { type: string, name: string }>} channelByRoomId
 */
export function resolveMessageFileCategory(message, channelByRoomId) {
  const mt = String(message?.messageType || '').toLowerCase();
  if (mt === 'image') return 'image';

  const ctx = String(message?.fileMeta?.retentionContext || 'org_room').toLowerCase();
  if (ctx === 'meeting') return 'voice_meeting';

  const roomId = String(message?.roomId || message?.channelId || '').trim();
  const chType = String(channelByRoomId.get(roomId)?.type || 'chat').toLowerCase();
  if (chType === 'voice') return 'channel_voice';
  if (chType === 'announcement') return 'announcement';
  return 'channel_chat';
}

export function mapMessageToOrgFile(message, channelByRoomId, t, locale) {
  const roomId = String(message?.roomId || message?.channelId || '').trim();
  const ch = channelByRoomId.get(roomId);
  const category = resolveMessageFileCategory(message, channelByRoomId);
  const url =
    String(message?.signedReadUrl || message?.readUrl || '').trim() ||
    (/^https?:\/\//i.test(String(message?.content || '')) ? String(message.content).trim() : '');

  return {
    id: String(message._id || message.id || `${roomId}-${message.createdAt}`),
    source: 'message',
    name: attachmentDisplayName(message, t('documents.orgUntitledFile')),
    size: formatFileSize(message?.fileMeta?.byteSize),
    sizeBytes: Number(message?.fileMeta?.byteSize) || 0,
    typeLabel: mimeToLabel(message?.fileMeta?.mimeType, message?.messageType),
    category,
    categoryLabel: '',
    channelName: ch?.name || t('documents.orgUnknownChannel'),
    departmentId: String(ch?.department || ch?.departmentId || message?.departmentId || '').trim(),
    teamId: String(ch?.team || ch?.teamId || message?.teamId || '').trim(),
    roomId,
    url,
    messageType: String(message?.messageType || 'file'),
    modified: message?.createdAt
      ? new Date(message.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    owner: t('documents.orgMemberFallback'),
    raw: message,
  };
}

export function mapLibraryDocumentToOrgFile(doc, t, locale) {
  const id = String(doc._id || doc.id || '');
  const sizeBytes = resolveDocByteSize(doc);
  return {
    id: `lib-${id}`,
    source: 'library',
    name: String(doc.name || doc.title || t('documents.orgUntitledFile')),
    size: formatFileSize(sizeBytes),
    sizeBytes,
    typeLabel: mimeToLabel(doc.mimeType, 'file'),
    category: 'library',
    categoryLabel: '',
    channelName: t('documents.orgCategoryLibrary'),
    departmentId: String(doc.departmentId || doc.department || '').trim(),
    teamId: String(doc.teamId || doc.team || '').trim(),
    projectId: String(doc.projectId || '').trim(),
    roomId: '',
    url: String(doc.fileUrl || doc.url || '').trim(),
    messageType: 'file',
    modified: doc.updatedAt || doc.createdAt
      ? new Date(doc.updatedAt || doc.createdAt).toLocaleString(
          locale === 'en' ? 'en-US' : 'vi-VN',
          { day: '2-digit', month: '2-digit', year: 'numeric' }
        )
      : '',
    owner:
      doc.uploadedBy?.displayName ||
      doc.uploadedBy?.username ||
      t('documents.orgMemberFallback'),
    raw: doc,
  };
}

/**
 * Thu hẹp list file theo corpus phòng/team/membership. Không mở rộng ngoài ACL overview.
 */
export function filterOrgFilesByScope(files, options = {}) {
  const list = Array.isArray(files) ? files : [];
  const teamId = String(options.teamId || '').trim();
  const deptId = String(options.departmentId || '').trim();
  const projectId = String(options.projectId || '').trim();
  if (projectId) {
    return list.filter((f) => String(f?.projectId || f?.raw?.projectId || '').trim() === projectId);
  }
  const teamChannelSet = toIdSet(options.teamChannelIds);
  const deptChannelSet = toIdSet(options.departmentChannelIds);
  const memberDepts = Array.isArray(options.memberDepartmentIds)
    ? options.memberDepartmentIds.map(String).filter(Boolean)
    : [];
  const memberChannels = toIdSet(options.memberChannelIds);

  if (teamId) {
    return list.filter((f) => {
      if (String(f?.source || '') === 'project') {
        const projDept = String(f?.departmentId || '').trim();
        return !projDept || projDept === deptId;
      }
      if (isSharedFilesCategory(f?.category) && !String(f?.roomId || '').trim()) return true;
      const fileTeam = String(f?.teamId || f?.raw?.teamId || '').trim();
      if (fileTeam && fileTeam === teamId) return true;
      const roomId = String(f?.roomId || '').trim();
      return Boolean(roomId && teamChannelSet.has(roomId));
    });
  }

  if (deptId) {
    return list.filter((f) => {
      if (String(f?.source || '') === 'project') {
        const projDept = String(f?.departmentId || '').trim();
        return !projDept || projDept === deptId;
      }
      if (isSharedFilesCategory(f?.category)) return true;
      const fileDept = String(f?.departmentId || f?.raw?.departmentId || '').trim();
      if (fileDept && fileDept === deptId) return true;
      const roomId = String(f?.roomId || '').trim();
      return Boolean(roomId && deptChannelSet.has(roomId));
    });
  }

  if (memberDepts.length || memberChannels.size) {
    const deptSet = new Set(memberDepts);
    return list.filter((f) => {
      if (String(f?.source || '') === 'project') return true;
      const roomId = String(f?.roomId || '').trim();
      if (roomId && memberChannels.has(roomId)) return true;
      const fileDept = String(f?.departmentId || f?.raw?.departmentId || '').trim();
      return Boolean(fileDept && deptSet.has(fileDept));
    });
  }

  return list;
}
