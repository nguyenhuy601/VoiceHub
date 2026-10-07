const { randomUUID } = require('crypto');
const axios = require('axios');
const { mongoose } = require('@enterprise/shared/config/mongo');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const messageService = require('../services/message.service');
const { emitRealtimeEvent } = require('../clients/realtime.client');
const firebaseStorage = require('../utils/firebaseStorage');
const objectStorage = require('../utils/objectStorage');
const { uploadBuffer, isFirebaseBillingOrPermissionError } = require('../utils/storageUpload');
const {
  assertAllowedStoragePath,
  openStorageObjectReadStream,
  guessContentTypeFromFileName,
  withUtf8ContentType,
} = require('../utils/storageRead');
const {
  attachSignedReadUrlsToMessages,
  attachSignedReadUrlToMessage,
} = require('../utils/attachSignedReadUrls');
const {
  ttlMsForRetentionContext,
  MAX_UPLOAD_BYTES,
  isMimeAllowed,
  isMimeDenied,
} = require('../config/fileRetention');
const {
  STORAGE_READ,
  isStorageReadStrict,
  isOwnTempPath,
  decideStorageRead,
  buildDownloadHeaders,
  hashUserIdForLog,
  storagePathPrefixForLog,
} = require('../utils/storageAccess');
const logger = require('@enterprise/shared/utils/logger');
const { publishTaskAiSyncEvent } = require('../messaging/taskAiSyncPublisher');
const { isTrustedGatewayForward } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  fetchAccessibleChannelPermissionMatrix,
  assertCanWriteInOrgChannel,
  assertCanReadInOrgChannel,
} = require('../utils/orgChannelPermissions');
const { resolveOrgChannelAccess } = require('../services/orgAccessReadModel');
const { headersForOrganizationForward } = require('../utils/organizationForwardHeaders');
const {
  DELETE_ACCESS,
  isOrgRoomMessage,
  resolveRoomDeleteAccess,
} = require('../utils/messageMutationPolicy');
const { maybeNotifyDmReceived } = require('../utils/dmPushNotification');
const { maybeNotifyCrossTeamContext } = require('../utils/crossTeamContextNotify');
const { maybeNotifyProjectMentions } = require('../utils/projectMentionNotify');
const { sendServiceError } = require('../middleware/sendServiceError');
const {
  MAX_MESSAGE_CONTENT,
  MAX_SEARCH_QUERY,
  MAX_PAGE,
  MAX_EMOJI_LENGTH,
  isUserMessageTypeAllowed,
  isDuplicateKeyError,
} = require('../utils/chatErrorMap');
const { buildPollFromInput } = require('../utils/pollPolicy');
const {
  isContextCallEnabled,
  isContextVisibleToRoom,
  parseVisibility,
  isProjectIntersectionVisibility,
} = require('../utils/contextCallVisibility');
const {
  hasActiveProjectMembership,
  listContextCallAudienceUserIds,
} = require('../services/projectMembershipReadModel');
const { parseMessageRefs } = require('../utils/messageRefs');
const { requireObjectId, requireUserId } = require('../utils/validateInput');
const { assertDmCanSend, dmErrorToJson } = require('../utils/verifyDmRelationship');

function chatUnauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

function chatMessageNotFound(res) {
  return sendServiceError(res, 404, {
    errorCode: 'MESSAGE_NOT_FOUND',
    messageUser: 'Không tìm thấy tin nhắn.',
    message: 'Message not found',
  });
}

function chatForbidden(res, messageUser, errorCode = 'MESSAGE_FORBIDDEN') {
  const msg = String(messageUser || 'Không đủ quyền đọc/sửa tin nhắn.').trim();
  return sendServiceError(res, 403, {
    errorCode,
    messageUser: msg,
    message: msg,
  });
}

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
const GENERIC_FORBIDDEN_MESSAGES = new Set(['Forbidden', 'Unauthorized']);

function safeErrorCode(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  return SAFE_ERROR_CODE.test(code) ? code : undefined;
}

/**
 * Map lỗi catch → HTTP: 403 → MESSAGE_FORBIDDEN; 5xx không lộ err.message / err.code driver;
 * 4xx giữ messageUser + errorCode dạng hằng.
 */
function chatCatchError(res, error, fallbackStatus = 500, fallbackCode = 'CHAT_INTERNAL_ERROR') {
  if (String(error?.message || '') === 'Unauthorized') {
    return chatForbidden(res, 'Không đủ quyền thực hiện thao tác này.');
  }
  const status = Number(error?.statusCode) || fallbackStatus;
  if (status === 403) {
    const raw = String(error?.messageUser || error?.message || '').trim();
    const msg = raw && !GENERIC_FORBIDDEN_MESSAGES.has(raw) ? raw : undefined;
    return chatForbidden(res, msg, safeErrorCode(error?.errorCode) || 'MESSAGE_FORBIDDEN');
  }
  if (status >= 500) {
    console.error(`[chat] ${status}:`, error?.message || 'unknown error');
    return sendServiceError(res, status, {
      errorCode: safeErrorCode(error?.errorCode) || fallbackCode,
      messageUser: error?.messageUser || undefined,
    });
  }
  const clientMessage = String(error?.messageUser || error?.message || 'Yêu cầu không hợp lệ').trim();
  return sendServiceError(res, status, {
    errorCode: safeErrorCode(error?.errorCode) || safeErrorCode(error?.code),
    messageUser: clientMessage,
    message: clientMessage,
  });
}

function respondContentTooLong(res) {
  return sendServiceError(res, 400, {
    errorCode: 'CHAT_CONTENT_TOO_LONG',
    messageUser: `Nội dung tin nhắn tối đa ${MAX_MESSAGE_CONTENT} ký tự.`,
  });
}

function respondInvalidChatId(res) {
  return sendServiceError(res, 400, {
    errorCode: 'CHAT_INVALID_ID',
    messageUser: 'Mã không hợp lệ.',
  });
}

function isInvalidDateParam(value) {
  if (value == null || value === '') return false;
  return Number.isNaN(new Date(String(value)).getTime());
}

/** Trả true nếu đã gửi 400 (q quá dài / ngày sai). */
function rejectInvalidSearchParams(res, { q, createdAfter, createdBefore } = {}) {
  if (q != null && String(q).length > MAX_SEARCH_QUERY) {
    sendServiceError(res, 400, {
      errorCode: 'CHAT_VALIDATION_ERROR',
      messageUser: `Từ khóa tìm kiếm tối đa ${MAX_SEARCH_QUERY} ký tự.`,
    });
    return true;
  }
  if (isInvalidDateParam(createdAfter) || isInvalidDateParam(createdBefore)) {
    sendServiceError(res, 400, {
      errorCode: 'CHAT_VALIDATION_ERROR',
      messageUser: 'Khoảng thời gian tìm kiếm không hợp lệ.',
    });
    return true;
  }
  return false;
}

function chatAclUnavailable(res) {
  return sendServiceError(res, 503, {
    errorCode: 'CHAT_ACL_UNAVAILABLE',
    messageUser: 'Không kiểm tra được quyền kênh. Vui lòng thử lại.',
  });
}

/** Lỗi kiểm quyền kênh: 5xx/không status → 503 generic; 4xx giữ code cũ client đang đọc. */
function respondOrgChannelPermError(res, permErr, fallbackMessage) {
  const status = Number(permErr?.statusCode);
  if (!status || status >= 500) {
    console.error('[chat] org channel ACL failed:', permErr?.message || 'unknown error');
    return chatAclUnavailable(res);
  }
  const isLocalDeny = !permErr?.code;
  return res.status(status).json({
    success: false,
    message: (isLocalDeny && permErr?.message) || fallbackMessage,
    code: 'ORG_CHANNEL_FORBIDDEN',
  });
}

/** Sửa/thu hồi tin kênh cần canWrite tại thời điểm thao tác. Trả true nếu đã gửi response lỗi. */
async function rejectRoomMutationWithoutWrite(res, req, messageId) {
  const existing = await messageService.getMessageById(messageId);
  if (!existing || !isOrgRoomMessage(existing)) return false;
  try {
    await assertCanWriteInOrgChannel(String(existing.organizationId), String(existing.roomId), req);
    return false;
  } catch (permErr) {
    respondOrgChannelPermError(res, permErr, 'Bạn không có quyền chat trong kênh này');
    return true;
  }
}

function resolveParticipantId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value._id != null) return String(value._id).trim();
  return String(value).trim();
}

async function assertCanAccessMessage(message, userId, req) {
  const uid = String(userId || '').trim();
  if (!uid || !message) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const senderId = resolveParticipantId(message.senderId);
  const receiverId = resolveParticipantId(message.receiverId);
  if (senderId === uid || receiverId === uid) {
    if (
      message.roomId &&
      isContextCallEnabled() &&
      !isContextVisibleToRoom() &&
      isProjectIntersectionVisibility(message.visibility)
    ) {
      const ok = await hasActiveProjectMembership(
        uid,
        String(message.organizationId || ''),
        message.visibility.projectId
      );
      if (!ok) {
        const hide = new Error('Forbidden');
        hide.statusCode = 403;
        throw hide;
      }
    }
    return true;
  }
  if (message.organizationId && message.roomId) {
    const orgId = String(message.organizationId);
    const { matrix } = await fetchAccessibleChannelPermissionMatrix(orgId, req);
    const perms = matrix[String(message.roomId)] || {};
    if (Boolean(perms.canRead)) {
      if (
        isContextCallEnabled() &&
        !isContextVisibleToRoom() &&
        isProjectIntersectionVisibility(message.visibility)
      ) {
        const ok = await hasActiveProjectMembership(
          uid,
          String(message.organizationId),
          message.visibility.projectId
        );
        if (!ok) {
          const hide = new Error('Forbidden');
          hide.statusCode = 403;
          throw hide;
        }
      }
      return true;
    }
  }
  const err = new Error('Forbidden');
  err.statusCode = 403;
  throw err;
}

const MAX_FILE_NAME_LENGTH = 255;

/** fileMeta do client gửi: MIME rủi ro → octet-stream, tên file làm sạch, byteSize trong giới hạn upload. */
function sanitizeClientFileMeta(fileMeta) {
  const mimeType = String(fileMeta?.mimeType || '').split(';')[0].trim().toLowerCase();
  const rawName = String(fileMeta?.originalName || '').trim();
  const byteSize = Number(fileMeta?.byteSize);
  return {
    originalName: rawName
      ? firebaseStorage.sanitizeFileName(rawName).slice(0, MAX_FILE_NAME_LENGTH)
      : '',
    mimeType: mimeType && isMimeAllowed(mimeType) ? mimeType : 'application/octet-stream',
    byteSize:
      Number.isInteger(byteSize) && byteSize >= 0 && byteSize <= MAX_UPLOAD_BYTES
        ? byteSize
        : undefined,
  };
}

const MAX_LINKED_MESSAGES_PER_PATH = 20;

/**
 * Quyền đọc object storage theo tin nhắn đang gắn path (tin chuyển tiếp có thể dùng chung path).
 * ACL 401/403 → không đọc được; lỗi hạ tầng (org-service) ném tiếp → 5xx thay vì 403 im lặng.
 */
async function resolveStorageReadDecision(normalizedPath, userId, req) {
  if (isOwnTempPath(normalizedPath, userId)) return STORAGE_READ.ALLOW;
  const linkedMessages = await Message.find({ 'fileMeta.storagePath': normalizedPath })
    .select('senderId receiverId roomId organizationId visibility')
    .limit(MAX_LINKED_MESSAGES_PER_PATH)
    .lean();
  let canAccessLinked = false;
  for (const linked of linkedMessages) {
    try {
      await assertCanAccessMessage(linked, userId, req);
      canAccessLinked = true;
      break;
    } catch (accessErr) {
      const status = Number(accessErr?.statusCode);
      if (status !== 401 && status !== 403) throw accessErr;
    }
  }
  return decideStorageRead({
    storagePath: normalizedPath,
    userId,
    linkedMessage: linkedMessages[0] || null,
    canAccessLinked,
    strict: isStorageReadStrict(),
  });
}

/** Realtime DM: gửi cùng payload tới sender + receiver (phòng user:{id}). */
async function emitDmToParticipants(eventName, message, extra = {}) {
  if (!eventName || !message) return;
  const senderId = resolveParticipantId(message.senderId);
  const receiverId = resolveParticipantId(message.receiverId);
  if (!senderId || !receiverId) return;

  const payload =
    extra && typeof extra === 'object' && Object.keys(extra).length > 0
      ? { ...message, ...extra }
      : message;

  await emitRealtimeEvent({
    event: eventName,
    userIds: [senderId, receiverId],
    payload,
  });
}

async function fetchAccessibleChannelIds(orgId, req) {
  const access = await resolveOrgChannelAccess(orgId, req);
  return access.channelIds;
}

/** ACL đã resolve ở org-service (documents-overview S2S) — tránh gọi lại accessible-channel-ids. */
function parseTrustedAllowedRoomIds(q, req) {
  if (!isTrustedGatewayForward(req)) return null;
  if (String(req.headers['x-vh-org-documents-internal'] || '').trim() !== '1') {
    return null;
  }
  const raw = q.allowedRoomIds ?? q.channelIds;
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

class MessageController {
  /**
   * Nội bộ: xóa toàn bộ DM giữa hai user (friend-service gọi khi xóa bạn).
   * Bảo vệ bằng header x-internal-token (CHAT_INTERNAL_TOKEN).
   */
  async deleteDmBetweenUsers(req, res) {
    try {
      const { userIdA, userIdB } = req.body || {};
      if (!userIdA || !userIdB) {
        return res.status(400).json({
          success: false,
          message: 'userIdA and userIdB are required',
        });
      }
      if (!mongoose.isValidObjectId(String(userIdA)) || !mongoose.isValidObjectId(String(userIdB))) {
        return respondInvalidChatId(res);
      }

      const result = await messageService.deleteDirectMessagesBetweenUsers(userIdA, userIdB);

      await emitRealtimeEvent({
        event: 'friend:dm_cleared',
        userIds: [String(userIdA), String(userIdB)],
        payload: {
          userIdA: String(userIdA),
          userIdB: String(userIdB),
          deletedCount: result.deletedCount,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Nội bộ: lấy message kèm fileMeta (task-service / worker).
   */
  async getMessageInternal(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const message = await messageService.getMessageById(messageId);
      if (!message) {
        return chatMessageNotFound(res);
      }
      return res.json({ success: true, data: message });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Nội bộ: export lịch sử kênh org (decrypted) cho summary pipeline.
   */
  async exportOrgThreadInternal(req, res) {
    try {
      const {
        organizationId,
        roomId,
        sinceMessageId,
        limit,
        unreadOnly,
        readerId,
        userId,
      } = req.query || {};

      const data = await messageService.exportOrgThreadInternal({
        organizationId,
        roomId,
        sinceMessageId,
        limit,
        unreadOnly,
        readerId: readerId || userId,
      });

      return res.json({ success: true, data });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      return chatCatchError(
        res,
        error,
        status,
        status === 400 ? 'CHAT_EXPORT_BAD_REQUEST' : 'CHAT_INTERNAL_ERROR'
      );
    }
  }

  /**
   * Nội bộ: ghi log cuộc gọi 1-1 đã kết thúc (voice-service).
   */
  async createCallLogInternal(req, res) {
    try {
      const { callerId, calleeId, media, durationSec } = req.body || {};
      if (!callerId || !calleeId) {
        return res.status(400).json({
          success: false,
          message: 'callerId and calleeId are required',
        });
      }

      const message = await messageService.createCallLogMessage({
        callerId,
        calleeId,
        media,
        durationSec,
      });
      const data = (await attachSignedReadUrlToMessage(message)) || message;

      await Promise.all([
        emitRealtimeEvent({
          event: 'friend:new_message',
          userId: String(calleeId),
          payload: data,
        }),
        emitRealtimeEvent({
          event: 'friend:sent',
          userId: String(callerId),
          payload: data,
        }),
      ]);

      return res.status(201).json({ success: true, data });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Nội bộ: đánh dấu file đã gắn task.
   */
  async promoteMessageFileInternal(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const { taskId } = req.body || {};
      if (!taskId) {
        return res.status(400).json({ success: false, message: 'taskId is required' });
      }
      const updated = await messageService.promoteFileForTask(messageId, taskId);
      if (!updated) {
        return chatMessageNotFound(res);
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Nội bộ: tạo signed read URL từ storagePath (S2S callers, ví dụ project-service).
   * Bảo vệ bằng header x-internal-token (CHAT_INTERNAL_TOKEN).
   */
  async getSignedReadUrlInternal(req, res) {
    try {
      if (!firebaseStorage.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'Firebase Storage is not configured on server',
        });
      }
      const storagePath = String(req.query?.storagePath || '').trim();
      if (!storagePath) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'storagePath là bắt buộc.',
          message: 'storagePath is required',
        });
      }
      const allowedPrefixes = ['temp/', 'tasks/', 'chat/', 'dm/'];
      const normalizedPath = storagePath.replace(/^\/+/, '');
      if (!allowedPrefixes.some((p) => normalizedPath.startsWith(p))) {
        return chatForbidden(res, 'storagePath not allowed', 'MESSAGE_FORBIDDEN');
      }
      if (normalizedPath.includes('..')) {
        return res.status(400).json({ success: false, message: 'Invalid storagePath' });
      }
      const ttlMs = Number(req.query?.ttlMs || 10 * 60 * 1000);
      const { url } = await firebaseStorage.getSignedReadUrl(normalizedPath, ttlMs);
      return res.json({ success: true, data: { url } });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Client: lấy signed URL upload lên Firebase (temp), không cần Firebase Auth.
   */
  async createSignedUploadUrl(req, res) {
    try {
      if (!firebaseStorage.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'Firebase Storage is not configured on server',
        });
      }

      const userId = req.user?.id || req.user?._id;
      const { fileName, mimeType, size, retentionContext } = req.body || {};

      if (!fileName || !mimeType || size == null || !retentionContext) {
        return res.status(400).json({
          success: false,
          message: 'fileName, mimeType, size, retentionContext are required',
        });
      }

      if (!['dm', 'org_room', 'meeting'].includes(retentionContext)) {
        return res.status(400).json({
          success: false,
          message: 'retentionContext must be dm | org_room | meeting',
        });
      }

      const n = Number(size);
      if (Number.isNaN(n) || n <= 0 || n > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          success: false,
          message: `Invalid size (max ${MAX_UPLOAD_BYTES} bytes)`,
        });
      }

      if (!isMimeAllowed(mimeType)) {
        return res.status(400).json({
          success: false,
          message: 'MIME type not allowed',
        });
      }

      const safe = firebaseStorage.sanitizeFileName(fileName);
      const storagePath = `temp/${String(userId)}/${randomUUID()}_${safe}`;

      const { uploadUrl, expires: uploadUrlExpires } = await firebaseStorage.getSignedUploadUrl(
        storagePath,
        mimeType,
        firebaseStorage.DEFAULT_UPLOAD_URL_MINUTES
      );

      const fileExpiresAt = new Date(Date.now() + ttlMsForRetentionContext(retentionContext));

      res.json({
        success: true,
        data: {
          uploadUrl,
          storagePath,
          uploadUrlExpiresAt: uploadUrlExpires.toISOString(),
          fileExpiresAt: fileExpiresAt.toISOString(),
          retentionContext,
        },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Upload file qua server (Admin SDK) — tránh browser PUT signed URL bị 403 CORS/GCS. */
  async uploadStorageObject(req, res) {
    try {
      if (!firebaseStorage.isEnabled() && !objectStorage.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'File storage is not configured on server',
          messageUser: 'Kho lưu trữ file chưa được cấu hình trên server.',
        });
      }

      const userId = req.user?.id || req.user?._id;
      const fileNameRaw =
        req.headers['x-file-name'] || req.headers['x-filename'] || '';
      let fileName = String(fileNameRaw || '').trim();
      try {
        fileName = decodeURIComponent(fileName);
      } catch {
        /* giữ nguyên nếu không encode */
      }
      const mimeType = String(
        req.headers['x-mime-type'] || req.headers['content-type'] || ''
      )
        .split(';')[0]
        .trim();
      const retentionContext = String(req.headers['x-retention-context'] || 'org_room').trim();
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      const size = body.length;

      if (!fileName || !mimeType || size <= 0) {
        return res.status(400).json({
          success: false,
          message: 'X-File-Name, X-Mime-Type and non-empty body are required',
        });
      }

      if (!['dm', 'org_room', 'meeting'].includes(retentionContext)) {
        return res.status(400).json({
          success: false,
          message: 'retentionContext must be dm | org_room | meeting',
        });
      }

      if (size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          success: false,
          message: `Invalid size (max ${MAX_UPLOAD_BYTES} bytes)`,
        });
      }

      if (!isMimeAllowed(mimeType)) {
        return res.status(400).json({
          success: false,
          message: 'MIME type not allowed',
        });
      }

      const safe = firebaseStorage.sanitizeFileName(fileName);
      const storagePath = `temp/${String(userId)}/${randomUUID()}_${safe}`;

      const { storageBackend } = await uploadBuffer(storagePath, body, mimeType);

      const fileExpiresAt = new Date(Date.now() + ttlMsForRetentionContext(retentionContext));

      res.json({
        success: true,
        data: {
          storagePath,
          storageBackend,
          fileExpiresAt: fileExpiresAt.toISOString(),
          retentionContext,
          mimeType,
          size,
        },
      });
    } catch (error) {
      if (isFirebaseBillingOrPermissionError(error) && !objectStorage.isEnabled()) {
        return sendServiceError(res, 503, {
          errorCode: 'CHAT_STORAGE_UNAVAILABLE',
          messageUser:
            'Kho lưu trữ Firebase tạm ngưng. Bật MinIO dev hoặc kích hoạt lại billing Firebase.',
          message: error.message,
        });
      }
      if (Number(error?.statusCode) === 503 && error?.messageUser) {
        return sendServiceError(res, 503, {
          errorCode: 'CHAT_STORAGE_UNAVAILABLE',
          messageUser: error.messageUser,
          message: error.message,
        });
      }
      return chatCatchError(res, error);
    }
  }

  /** Tải object storage (MinIO/Firebase) qua same-origin — JWT, tránh href storagePath trong SPA. */
  async downloadStorageObject(req, res) {
    try {
      const storagePath = String(req.query?.storagePath || '').trim();
      if (!storagePath) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'storagePath là bắt buộc.',
          message: 'storagePath is required',
        });
      }

      const normalizedPath = assertAllowedStoragePath(storagePath);
      const userId = String(req.user?.id || req.user?._id || '').trim();
      const decision = await resolveStorageReadDecision(normalizedPath, userId, req);
      if (decision === STORAGE_READ.DENY) {
        return chatForbidden(res, 'Bạn không có quyền mở tệp này.', 'MESSAGE_FORBIDDEN');
      }
      if (decision === STORAGE_READ.ALLOW_UNLINKED) {
        logger.warn('[storage-read] unlinked', {
          userIdHash: hashUserIdForLog(userId),
          prefix: storagePathPrefixForLog(normalizedPath),
        });
      }

      const { stream, fileName } = await openStorageObjectReadStream(normalizedPath);
      const safeName = firebaseStorage.sanitizeFileName(fileName);
      const requestedMime = String(req.query?.mimeType || '').split(';')[0].trim();
      const mimeBase =
        (requestedMime && !isMimeDenied(requestedMime) ? requestedMime : '') ||
        guessContentTypeFromFileName(fileName).split(';')[0].trim();
      const headers = buildDownloadHeaders({
        mimeType: mimeBase,
        fileName: safeName,
        contentType: withUtf8ContentType(mimeBase),
      });
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
      }
      stream.on('error', (err) => {
        if (!res.headersSent) {
          chatCatchError(res, err);
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch (error) {
      if (isFirebaseBillingOrPermissionError(error)) {
        return sendServiceError(res, 503, {
          errorCode: 'CHAT_STORAGE_UNAVAILABLE',
          messageUser:
            error.messageUser ||
            'Kho lưu trữ tạm thời không đọc được file này. Thử tải lên lại hoặc kiểm tra MinIO/Firebase.',
          message: error.message,
        });
      }
      const status = Number(error?.statusCode) || 500;
      if (status === 404) {
        return sendServiceError(res, 404, {
          errorCode: 'MESSAGE_NOT_FOUND',
          messageUser: 'Không tìm thấy tệp đính kèm.',
          message: error.message,
        });
      }
      if (status === 503) {
        return sendServiceError(res, 503, {
          errorCode: error.errorCode || 'CHAT_STORAGE_UNAVAILABLE',
          messageUser:
            error.messageUser ||
            'Kho lưu trữ tạm thời không khả dụng. Vui lòng thử lại sau.',
          message: error.message,
        });
      }
      if (status === 403) {
        return chatForbidden(res, error.message, error.errorCode || 'MESSAGE_FORBIDDEN');
      }
      if (status === 400) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return chatCatchError(res, error);
    }
  }

  // Tạo tin nhắn mới
  async createMessage(req, res) {
    try {
      const {
        content,
        receiverId,
        roomId,
        messageType,
        organizationId,
        fileMeta,
        replyToMessageId,
        visibility,
        refs,
        mentionedUserIds,
        poll,
      } = req.body;
      const senderId = req.user?.id || req.user?._id;
      if (content != null && typeof content !== 'string') {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Nội dung tin nhắn không hợp lệ.',
        });
      }
      if (typeof content === 'string' && content.length > MAX_MESSAGE_CONTENT) {
        return respondContentTooLong(res);
      }
      const resolvedMessageType = messageType == null || messageType === '' ? 'text' : messageType;
      if (
        typeof resolvedMessageType !== 'string' ||
        !isUserMessageTypeAllowed(resolvedMessageType, { isRoom: Boolean(roomId) && !receiverId })
      ) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_INVALID_MESSAGE_TYPE',
          messageUser: 'Loại tin nhắn không được hỗ trợ.',
        });
      }
      const parsedVisibility = isContextCallEnabled() ? parseVisibility(visibility) : null;
      const parsedRefs = parseMessageRefs(refs);
      if (parsedRefs.error) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: parsedRefs.error,
          message: parsedRefs.error,
          extra: { code: 'CONTEXT_REF_INVALID' },
        });
      }
      const firstRef = parsedRefs.refs[0] || null;
      const resolvedContent =
        String(content || '').trim() ||
        (firstRef ? String(firstRef.label || 'Context').trim() : '') ||
        (parsedVisibility ? String(parsedVisibility.projectName || 'Context').trim() : '');

      if (!resolvedContent || (!receiverId && !roomId)) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Cần nội dung và receiverId hoặc roomId.',
          message: 'Content and receiverId or roomId are required',
        });
      }

      if ((parsedVisibility || firstRef) && receiverId) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Context call chỉ hỗ trợ kênh tổ chức.',
          message: 'Context call is only supported on organization channels',
          extra: { code: 'CONTEXT_CALL_ROOM_ONLY' },
        });
      }

      let resolvedReceiverId = null;
      let resolvedRoomId = null;
      let resolvedOrganizationId = organizationId;
      if (receiverId) {
        resolvedReceiverId = requireObjectId(res, receiverId, 'receiverId', 'CHAT_VALIDATION_ERROR');
        if (!resolvedReceiverId) return undefined;
      }
      if (roomId) {
        resolvedRoomId = requireObjectId(res, roomId, 'roomId', 'CHAT_VALIDATION_ERROR');
        if (!resolvedRoomId) return undefined;
        if (!organizationId) {
          return sendServiceError(res, 400, {
            errorCode: 'CHAT_VALIDATION_ERROR',
            messageUser: 'organizationId là bắt buộc khi có roomId.',
            message: 'organizationId is required when roomId is provided',
            extra: { code: 'ORG_ID_REQUIRED_FOR_ROOM' },
          });
        }
        resolvedOrganizationId = requireObjectId(
          res,
          organizationId,
          'organizationId',
          'CHAT_VALIDATION_ERROR'
        );
        if (!resolvedOrganizationId) return undefined;
      } else if (organizationId) {
        resolvedOrganizationId = requireObjectId(
          res,
          organizationId,
          'organizationId',
          'CHAT_VALIDATION_ERROR'
        );
        if (!resolvedOrganizationId) return undefined;
      }

      const messageData = {
        senderId,
        content: resolvedContent,
        messageType: resolvedMessageType,
        organizationId: resolvedOrganizationId,
      };
      if (parsedVisibility) {
        messageData.visibility = parsedVisibility;
      }
      if (parsedRefs.refs.length) {
        messageData.refs = parsedRefs.refs;
      }

      if (resolvedReceiverId) {
        messageData.receiverId = resolvedReceiverId;
        try {
          await assertDmCanSend({
            peerId: resolvedReceiverId,
            senderId,
            authorizationHeader: req.headers?.authorization,
          });
        } catch (dmErr) {
          if (dmErr.statusCode) {
            return res.status(dmErr.statusCode).json(dmErrorToJson(dmErr));
          }
          throw dmErr;
        }
      }

      if (resolvedRoomId) {
        messageData.roomId = resolvedRoomId;
        messageData.organizationId = resolvedOrganizationId;
        try {
          await assertCanWriteInOrgChannel(resolvedOrganizationId, resolvedRoomId, req);
        } catch (permErr) {
          return respondOrgChannelPermError(res, permErr, 'Bạn không có quyền chat trong kênh này');
        }
        if (parsedVisibility) {
          const memberOk = await hasActiveProjectMembership(
            senderId,
            resolvedOrganizationId,
            parsedVisibility.projectId
          );
          if (!memberOk) {
            return sendServiceError(res, 403, {
              errorCode: 'CONTEXT_CALL_NOT_PROJECT_MEMBER',
              messageUser: 'Bạn không phải thành viên dự án này',
              message: 'Bạn không phải thành viên dự án này',
              extra: { code: 'CONTEXT_CALL_NOT_PROJECT_MEMBER' },
            });
          }
        }
        if (firstRef) {
          const memberOk = await hasActiveProjectMembership(
            senderId,
            resolvedOrganizationId,
            firstRef.projectId
          );
          if (!memberOk) {
            return sendServiceError(res, 403, {
              errorCode: 'CONTEXT_REF_NOT_PROJECT_MEMBER',
              messageUser: 'Bạn không phải thành viên dự án này',
              message: 'Bạn không phải thành viên dự án này',
              extra: { code: 'CONTEXT_REF_NOT_PROJECT_MEMBER' },
            });
          }
        }
      }

      if (replyToMessageId) {
        const parent = await messageService.getMessageById(replyToMessageId);
        if (!parent) {
          return res.status(400).json({
            success: false,
            message: 'Invalid reply target',
          });
        }
        try {
          await assertCanAccessMessage(parent, senderId, req);
        } catch (accessErr) {
          return res.status(accessErr.statusCode || 403).json({
            success: false,
            message: accessErr.message || 'Invalid reply target',
          });
        }
        if (roomId) {
          if (String(parent.roomId || '') !== String(roomId)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
        } else if (receiverId) {
          if (parent.roomId) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
          const u1 = String(senderId);
          const u2 = String(receiverId);
          const pSend = String(parent.senderId?._id || parent.senderId || '');
          const pRecv = String(parent.receiverId?._id || parent.receiverId || '');
          const sameDm =
            (pSend === u1 && pRecv === u2) || (pSend === u2 && pRecv === u1);
          if (!sameDm) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid reply target',
          });
        }
        messageData.replyToMessageId = replyToMessageId;
      }

      const mt = messageData.messageType;
      if (fileMeta && (mt === 'image' || mt === 'file')) {
        const sp = fileMeta.storagePath;
        const prefix = `temp/${String(senderId)}/`;
        if (!sp || typeof sp !== 'string' || !sp.startsWith(prefix)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid fileMeta.storagePath for this user',
          });
        }
        const ctx = fileMeta.retentionContext || (receiverId ? 'dm' : 'org_room');
        if (!['dm', 'org_room', 'meeting'].includes(ctx)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid retentionContext',
          });
        }
        const minioOn = Boolean(
          process.env.MINIO_ENDPOINT &&
            process.env.MINIO_ACCESS_KEY &&
            process.env.MINIO_SECRET_KEY &&
            process.env.MINIO_BUCKET
        );
        const uploadMode = String(process.env.CHAT_UPLOAD_STORAGE || 'auto')
          .trim()
          .toLowerCase();
        const preferMinio = uploadMode === 'minio' || (uploadMode === 'auto' && minioOn);
        messageData.fileMeta = {
          storagePath: sp,
          storageBucket: preferMinio
            ? process.env.MINIO_BUCKET
            : process.env.FIREBASE_STORAGE_BUCKET || process.env.MINIO_BUCKET,
          ...sanitizeClientFileMeta(fileMeta),
          retentionContext: ctx,
          storageTier: 'temp',
          expiresAt: new Date(Date.now() + ttlMsForRetentionContext(ctx)),
        };
        // content giữ tên file (req.body); signed read URL gắn khi trả API/emit.
      }

      if (resolvedMessageType === 'poll') {
        const built = buildPollFromInput(poll);
        messageData.poll = built;
        messageData.content = built.question;
      }

      const message = await messageService.createMessage(messageData);
      let payloadMessage = message;
      try {
        payloadMessage = (await attachSignedReadUrlToMessage(message)) || message;
      } catch (attachErr) {
        console.warn(
          '[createMessage] attachSignedReadUrl skipped:',
          attachErr?.message || attachErr
        );
        payloadMessage = message;
      }

      if (receiverId) {
        await Promise.all([
          emitRealtimeEvent({
            event: 'friend:new_message',
            userId: String(receiverId),
            payload: payloadMessage,
          }),
          emitRealtimeEvent({
            event: 'friend:sent',
            userId: String(senderId),
            payload: payloadMessage,
          }),
        ]);
        maybeNotifyDmReceived(payloadMessage).catch(() => null);
      }

      if (roomId) {
        const hideFromNonMembers =
          isProjectIntersectionVisibility(payloadMessage.visibility) && !isContextVisibleToRoom();
        if (hideFromNonMembers) {
          const audience = await listContextCallAudienceUserIds({
            organizationId,
            roomId,
            projectId: payloadMessage.visibility.projectId,
          });
          const userIds = [...new Set([...audience, String(senderId)])];
          await emitRealtimeEvent({
            event: 'room:new_message',
            userIds,
            payload: payloadMessage,
          });
        } else {
          await emitRealtimeEvent({
            event: 'room:new_message',
            roomId: String(roomId),
            payload: payloadMessage,
          });
        }
        maybeNotifyCrossTeamContext({ message: payloadMessage }).catch(() => null);
        maybeNotifyProjectMentions({
          message: payloadMessage,
          mentionedUserIds,
        }).catch(() => null);
      }

      res.status(201).json({
        success: true,
        data: payloadMessage,
      });
    } catch (error) {
      console.error(
        '[createMessage] failed:',
        error?.message || error,
        error?.stack ? String(error.stack).slice(0, 500) : ''
      );
      return chatCatchError(res, error);
    }
  }

  /**
   * Danh sách tin nhắn kênh tổ chức chưa đọc (mới nhất trước).
   */
  async getUnreadOrgMessagesFeed(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return chatUnauthorized(res);
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
      const UserOrgChannelAccess = require('../models/UserOrgChannelAccess');
      const accessRows = await UserOrgChannelAccess.find({ userId: String(userId) })
        .select('channelIds')
        .lean();
      const allowedRoomIds = [
        ...new Set(
          accessRows.flatMap((row) =>
            Array.isArray(row.channelIds) ? row.channelIds.map(String) : []
          )
        ),
      ];
      const messages = await messageService.findUnreadOrgRoomMessages(
        userId,
        limit,
        allowedRoomIds
      );
      const enriched = await attachSignedReadUrlsToMessages(messages);

      res.json({
        success: true,
        data: { messages: enriched },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Thống kê tin nhắn cho dashboard: hôm nay / hôm qua + % thay đổi (tin gửi đến user, DM).
   */
  async getMessageStatsSummary(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return chatUnauthorized(res);
      }

      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endToday = new Date(startToday);
      endToday.setDate(endToday.getDate() + 1);

      const startYesterday = new Date(startToday);
      startYesterday.setDate(startYesterday.getDate() - 1);
      const endYesterday = startToday;

      const [todayCount, yesterdayCount, unreadCount] = await Promise.all([
        messageService.countIncomingMessagesInRange(userId, startToday, endToday),
        messageService.countIncomingMessagesInRange(userId, startYesterday, endYesterday),
        messageService.countUnreadIncoming(userId),
      ]);

      let changePercent = 0;
      let trend = 'flat';
      if (yesterdayCount > 0) {
        changePercent = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
        if (changePercent > 0) trend = 'up';
        else if (changePercent < 0) trend = 'down';
        else trend = 'flat';
      } else if (todayCount > 0) {
        changePercent = 100;
        trend = 'up';
      }

      res.json({
        success: true,
        data: {
          todayCount,
          yesterdayCount,
          unreadCount,
          changePercent,
          trend,
        },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Lấy tin nhắn theo ID
  async getMessageById(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId');
      if (!messageId) return;
      const userId = requireUserId(res, req);
      if (!userId) return;
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return chatMessageNotFound(res);
      }

      await assertCanAccessMessage(message, userId, req);

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Tìm trong hội thoại DM với một bạn. */
  async searchDmMessages(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { peerId, q, page, limit } = req.query || {};
      if (!userId || !peerId) {
        return res.status(400).json({
          success: false,
          message: 'peerId is required',
        });
      }
      if (rejectInvalidSearchParams(res, { q })) return;
      const result = await messageService.searchDmMessages(userId, peerId, {
        q: q || '',
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 30,
      });
      const messages = await attachSignedReadUrlsToMessages(result.messages || []);
      res.json({
        success: true,
        data: { ...result, messages },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Tìm kiếm tin nhắn trong kênh tổ chức — organizationId bắt buộc; roomId giới trong kênh được phép. */
  async searchMessages(req, res) {
    try {
      const q = req.query || {};
      const organizationId = q.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organizationId is required',
        });
      }
      if (
        rejectInvalidSearchParams(res, {
          q: q.q,
          createdAfter: q.createdAfter,
          createdBefore: q.createdBefore,
        })
      ) {
        return;
      }
      let allowedRoomIds;
      const preResolved = parseTrustedAllowedRoomIds(q, req);
      try {
        allowedRoomIds =
          preResolved !== null
            ? preResolved
            : await fetchAccessibleChannelIds(organizationId, req);
      } catch (e) {
        const upstream = e.response?.status || e.statusCode;
        // eslint-disable-next-line no-console
        console.error(
          '[searchMessages] accessible-channel-ids failed:',
          upstream,
          e.code,
          e.message
        );
        if (e.code === 'ORG_SERVICE_CIRCUIT_OPEN' || upstream === 503) {
          return res.status(503).json({
            success: false,
            code: safeErrorCode(e.code) || 'ORG_SERVICE_CIRCUIT_OPEN',
            message: 'Dịch vụ tổ chức tạm thời không khả dụng. Vui lòng thử lại.',
          });
        }
        if (upstream === 401) {
          return sendServiceError(res, 401, {
            errorCode: 'ORG_CHANNEL_AUTH_REQUIRED',
            messageUser: 'Vui lòng đăng nhập lại.',
            message: 'Vui lòng đăng nhập lại.',
            extra: { code: 'ORG_CHANNEL_AUTH_REQUIRED' },
          });
        }
        if (upstream === 403) {
          return sendServiceError(res, 403, {
            errorCode: 'ORG_CHANNEL_ACCESS_DENIED',
            messageUser: 'Bạn không có quyền tìm kiếm trong tổ chức này.',
            message: 'Bạn không có quyền tìm kiếm trong tổ chức này.',
            extra: { code: 'ORG_CHANNEL_ACCESS_DENIED' },
          });
        }
        if (upstream >= 500) {
          return res.status(502).json({
            success: false,
            code: 'CHANNEL_ACCESS_ORG_ERROR',
            message: 'Không xác minh được quyền kênh. Vui lòng thử lại.',
          });
        }
        const transient =
          e.code === 'ECONNREFUSED' ||
          e.code === 'ENOTFOUND' ||
          e.code === 'ETIMEDOUT' ||
          e.code === 'ECONNRESET' ||
          e.message?.toLowerCase().includes('timeout');
        if (transient || !upstream) {
          return res.status(503).json({
            success: false,
            code: 'CHANNEL_ACCESS_VERIFY_FAILED',
            message: 'Không xác minh được quyền kênh. Vui lòng thử lại.',
          });
        }
        return res.status(502).json({
          success: false,
          code: 'CHANNEL_ACCESS_ORG_ERROR',
          message: 'Không xác minh được quyền kênh. Vui lòng thử lại.',
        });
      }
      if (!allowedRoomIds.length) {
        return res.json({
          success: true,
          data: {
            messages: [],
            total: 0,
            currentPage: 1,
            totalPages: 0,
          },
        });
      }
      const roomId = q.roomId || null;
      if (roomId && !allowedRoomIds.includes(String(roomId))) {
        return chatForbidden(res, 'Cannot search in this channel');
      }
      const result = await messageService.searchOrgMessages({
        organizationId,
        allowedRoomIds,
        roomId,
        senderId: q.senderId || null,
        q: q.q || '',
        createdAfter: q.createdAfter || null,
        createdBefore: q.createdBefore || null,
        hasAttachment: q.hasAttachment,
        hasLink: q.hasLink,
        hasEmbed: q.hasEmbed,
        messageType: q.messageType || null,
        mentionText: q.mentionText || null,
        page: Math.min(MAX_PAGE, parseInt(q.page, 10) || 1),
        limit: parseInt(q.limit, 10) || 20,
        pageToken: q.pageToken || null,
        fields: q.fields || 'summary',
        viewerUserId: req.user?.id || req.user?._id || null,
      });
      const messages = await attachSignedReadUrlsToMessages(result.messages || []);
      res.json({
        success: true,
        data: { ...result, messages },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Lấy danh sách tin nhắn
  async getMessages(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const q = req.query || {};
      const {
        receiverId,
        roomId,
        organizationId,
        page,
        limit,
        pageToken,
        fields,
        markConversationRead,
        markRoomRead,
        includeReadCursors,
        lastReadMessageId,
        unreadByPeer,
        search,
      } = q;
      const searchQ = q.q;

      if (String(unreadByPeer || '') === '1') {
        if (!userId) {
          return chatUnauthorized(res);
        }
        const byPeer = await messageService.countUnreadByPeer(userId);
        return res.json({ success: true, data: { byPeer } });
      }

      if (
        receiverId &&
        (String(search || '') === '1' || String(search || '') === 'true') &&
        String(searchQ || '').trim().length >= 1
      ) {
        if (!userId) {
          return chatUnauthorized(res);
        }
        if (rejectInvalidSearchParams(res, { q: searchQ })) return;
        const result = await messageService.searchDmMessages(userId, receiverId, {
          q: searchQ || '',
          page: parseInt(page, 10) || 1,
          limit: parseInt(limit, 10) || 30,
          pageToken: pageToken || null,
          fields: fields || 'summary',
        });
        const messages = await attachSignedReadUrlsToMessages(result.messages || []);
        return res.json({
          success: true,
          data: { ...result, messages },
        });
      }

      if (receiverId && (String(markConversationRead || '') === '1' || markConversationRead === true)) {
        if (!userId) {
          return chatUnauthorized(res);
        }
        const result = await messageService.markConversationAsRead(userId, receiverId);
        if (result.modifiedCount > 0) {
          await emitRealtimeEvent({
            event: 'friend:messages_read',
            userId: String(receiverId),
            payload: {
              peerId: String(receiverId),
              readerId: String(userId),
              readAt: result.readAt,
              lastReadMessageId: result.lastReadMessageId,
            },
          });
        }
        return res.json({ success: true, data: result });
      }

      // Receipts kênh: watermark RoomReadCursor (không route mới).
      if (roomId && (String(markRoomRead || '') === '1' || markRoomRead === true)) {
        if (!userId) {
          return chatUnauthorized(res);
        }
        if (!organizationId) {
          return res.status(400).json({
            success: false,
            message: 'organizationId is required when roomId is provided',
            code: 'ORG_ID_REQUIRED_FOR_ROOM',
          });
        }
        try {
          await assertCanReadInOrgChannel(organizationId, roomId, req);
        } catch (permErr) {
          return respondOrgChannelPermError(res, permErr, 'Bạn không có quyền đọc kênh này');
        }
        const roomReadCursorService = require('../services/roomReadCursor.service');
        const result = await roomReadCursorService.markRoomReadUpTo({
          roomId,
          userId,
          lastReadMessageId: lastReadMessageId || null,
        });
        if (result.advanced) {
          await emitRealtimeEvent({
            event: 'room:read_up_to',
            roomId: String(roomId),
            payload: {
              roomId: String(roomId),
              organizationId: String(organizationId),
              readerId: String(userId),
              lastReadMessageId: result.lastReadMessageId,
              readAt: result.readAt,
            },
          });
        }
        return res.json({ success: true, data: result });
      }

      const filter = {};

      if (receiverId) {
        if (!mongoose.Types.ObjectId.isValid(String(userId)) || !mongoose.Types.ObjectId.isValid(String(receiverId))) {
          return res.status(400).json({
            success: false,
            message: 'Invalid user id',
          });
        }
        const me = new mongoose.Types.ObjectId(String(userId));
        const peer = new mongoose.Types.ObjectId(String(receiverId));
        const orgFilter = organizationId && mongoose.Types.ObjectId.isValid(String(organizationId))
          ? new mongoose.Types.ObjectId(String(organizationId))
          : null;
        const dmConversation = await Conversation.findOne({
          type: 'dm',
          members: { $all: [me, peer], $size: 2 },
          organizationId: orgFilter,
        }).select('_id');

        if (dmConversation?._id) {
          // Ưu tiên query theo conversationId mới; vẫn giữ fallback dữ liệu cũ chưa có conversationId.
          filter.$or = [
            { conversationId: dmConversation._id },
            {
              conversationId: { $exists: false },
              $or: [
                { senderId: userId, receiverId },
                { senderId: receiverId, receiverId: userId },
              ],
            },
            {
              conversationId: null,
              $or: [
                { senderId: userId, receiverId },
                { senderId: receiverId, receiverId: userId },
              ],
            },
          ];
        } else {
          filter.$or = [
            { senderId: userId, receiverId },
            { senderId: receiverId, receiverId: userId },
          ];
        }
      } else if (roomId) {
        // D6: không cho list theo roomId trần (IDOR)
        if (!organizationId) {
          return res.status(400).json({
            success: false,
            message: 'organizationId is required when roomId is provided',
            code: 'ORG_ID_REQUIRED_FOR_ROOM',
          });
        }
        try {
          await assertCanReadInOrgChannel(organizationId, roomId, req);
        } catch (permErr) {
          return respondOrgChannelPermError(res, permErr, 'Bạn không có quyền đọc kênh này');
        }
        filter.roomId = roomId;
      } else {
        filter.$or = [
          { senderId: userId },
          { receiverId: userId },
        ];
      }

      if (organizationId) {
        filter.organizationId = organizationId;
      }

      const options = {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
        pageToken: pageToken ? String(pageToken).trim() : null,
        fields: fields === 'full' ? 'full' : 'summary',
        viewerUserId: userId,
        viewerOrganizationId: organizationId || null,
      };

      if (receiverId && userId) {
        const a = String(userId);
        const b = String(receiverId);
        options.dmCacheKey = [a, b].sort().join(':');
      }

      const result = await messageService.getMessages(filter, options);
      const messages = await attachSignedReadUrlsToMessages(result.messages || []);

      let readCursors = undefined;
      if (
        roomId &&
        (String(includeReadCursors || '') === '1' || includeReadCursors === true)
      ) {
        const roomReadCursorService = require('../services/roomReadCursor.service');
        readCursors = await roomReadCursorService.listCursorsForRoom(roomId);
      }

      res.json({
        success: true,
        data: {
          ...result,
          messages,
          ...(readCursors ? { readCursors } : {}),
        },
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markAsRead(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const userId = req.user?.id || req.user?._id;

      const existing = await messageService.getMessageById(messageId);
      if (!existing) {
        return chatMessageNotFound(res);
      }
      const receiverId = resolveParticipantId(existing.receiverId);
      if (receiverId && receiverId !== String(userId)) {
        return chatForbidden(res, 'Only the receiver can mark this message as read');
      }

      const message = await messageService.markAsRead(messageId, userId);

      if (!message) {
        return chatMessageNotFound(res);
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Đánh dấu đã đọc toàn bộ tin DM từ một bạn. */
  async markConversationAsRead(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { peerId } = req.body || {};
      if (!userId || !peerId) {
        return res.status(400).json({
          success: false,
          message: 'peerId is required',
        });
      }

      const result = await messageService.markConversationAsRead(userId, peerId);

      if (result.modifiedCount > 0) {
        await emitRealtimeEvent({
          event: 'friend:messages_read',
          userId: String(peerId),
          payload: {
            peerId: String(peerId),
            readerId: String(userId),
            readAt: result.readAt,
            lastReadMessageId: result.lastReadMessageId,
          },
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Số tin chưa đọc theo từng bạn (DM). */
  async getUnreadByPeer(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return chatUnauthorized(res);
      }
      const byPeer = await messageService.countUnreadByPeer(userId);
      res.json({ success: true, data: { byPeer } });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  async addReaction(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const { emoji } = req.body || {};
      const userId = req.user?.id || req.user?._id;

      const existing = await messageService.getMessageById(messageId);
      if (!existing || existing.isDeleted || existing.isRecalled) {
        return chatMessageNotFound(res);
      }
      await assertCanAccessMessage(existing, userId, req);

      const message = await messageService.addReaction(messageId, userId, emoji);
      if (!message) {
        return chatMessageNotFound(res);
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;
      if (data?.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_reaction',
          roomId: String(data.roomId),
          payload: data,
        });
      } else {
        await emitDmToParticipants('friend:message_reaction', data);
      }

      res.json({ success: true, data });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  async votePoll(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const userId = req.user?.id || req.user?._id;
      if (!userId) return chatUnauthorized(res);
      const optionIds = req.body?.optionIds;

      const existing = await messageService.getMessageById(messageId);
      if (!existing || existing.isDeleted || existing.isRecalled) {
        return chatMessageNotFound(res);
      }
      if (!existing.roomId || existing.messageType !== 'poll') {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Chỉ bỏ phiếu trên khảo sát kênh.',
        });
      }
      await assertCanAccessMessage(existing, userId, req);

      const message = await messageService.votePoll(messageId, userId, optionIds);
      if (!message) return chatMessageNotFound(res);

      const broadcast = message.poll
        ? { ...message, poll: { ...message.poll, viewerVoteOptionIds: [] } }
        : message;
      await emitRealtimeEvent({
        event: 'room:poll_updated',
        roomId: String(message.roomId),
        payload: broadcast,
      });

      res.json({ success: true, data: message });
    } catch (error) {
      if (
        error?.errorCode === 'CHAT_POLL_CLOSED' ||
        error?.errorCode === 'CHAT_POLL_EXPIRED' ||
        error?.errorCode === 'CHAT_POLL_ALREADY_VOTED'
      ) {
        console.warn('[chat] vote denied', {
          messageId: String(req.params.messageId || ''),
          errorCode: error.errorCode,
        });
      }
      return chatCatchError(res, error);
    }
  }

  async removeReaction(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      let decodedEmoji;
      try {
        decodedEmoji = decodeURIComponent(req.params.emoji || '');
      } catch {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Biểu cảm không hợp lệ',
        });
      }
      if (decodedEmoji.length > MAX_EMOJI_LENGTH) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Biểu cảm không hợp lệ',
        });
      }
      const userId = req.user?.id || req.user?._id;

      const existing = await messageService.getMessageById(messageId);
      if (!existing) {
        return chatMessageNotFound(res);
      }
      await assertCanAccessMessage(existing, userId, req);

      const message = await messageService.removeReaction(messageId, userId, decodedEmoji);
      if (!message) {
        return chatMessageNotFound(res);
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;
      if (data?.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_reaction',
          roomId: String(data.roomId),
          payload: data,
        });
      } else {
        await emitDmToParticipants('friend:message_reaction', data);
      }

      res.json({ success: true, data });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Xóa tin nhắn
  async deleteMessage(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId');
      if (!messageId) return;
      const userId = requireUserId(res, req);
      if (!userId) return;

      const existing = await messageService.getMessageById(messageId);
      if (!existing || existing.isDeleted) {
        return chatMessageNotFound(res);
      }
      let asModerator = false;
      if (isOrgRoomMessage(existing)) {
        let perms;
        try {
          const { matrix } = await fetchAccessibleChannelPermissionMatrix(
            String(existing.organizationId),
            req
          );
          perms = matrix[String(existing.roomId)] || {};
        } catch (permErr) {
          return respondOrgChannelPermError(res, permErr, 'Bạn không có quyền xóa tin nhắn trong kênh này');
        }
        const isSender = resolveParticipantId(existing.senderId) === String(userId);
        const access = resolveRoomDeleteAccess({ isSender, perms });
        if (!access) {
          return chatForbidden(res, 'Bạn không có quyền xóa tin nhắn trong kênh này');
        }
        asModerator = access === DELETE_ACCESS.MODERATOR;
      }

      const message = await messageService.deleteMessage(messageId, userId, { asModerator });
      if (message && asModerator) {
        console.info('[chat] moderator delete', {
          messageId: String(messageId),
          organizationId: String(existing.organizationId),
          roomId: String(existing.roomId),
          actorId: String(userId),
        });
      }

      if (!message) {
        return sendServiceError(res, 404, {
          errorCode: 'MESSAGE_NOT_FOUND',
          messageUser: 'Không tìm thấy tin nhắn hoặc không có quyền.',
          message: 'Message not found or unauthorized',
        });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        message: 'Message deleted successfully',
        data,
      });

      if (message?.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_deleted',
          roomId: String(message.roomId),
          payload: data,
        });
      } else if (message?.receiverId) {
        await emitDmToParticipants('friend:message_deleted', data, {
          messageId: String(messageId),
        });
      }
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Thu hồi tin nhắn (Recall)
  async recallMessage(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const userId = req.user?.id || req.user?._id;

      const blocked = await rejectRoomMutationWithoutWrite(res, req, messageId);
      if (blocked) return;

      const message = await messageService.recallMessage(messageId, userId);

      if (!message) {
        return sendServiceError(res, 404, {
          errorCode: 'MESSAGE_NOT_FOUND',
          messageUser: 'Không tìm thấy tin nhắn hoặc không có quyền.',
          message: 'Message not found or unauthorized',
        });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        message: 'Message recalled successfully',
        data,
      });

      if (message?.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_recalled',
          roomId: String(message.roomId),
          payload: data,
        });
      } else if (message?.receiverId) {
        await emitDmToParticipants('friend:message_recalled', data, {
          messageId: String(messageId),
        });
      }
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  // Chỉnh sửa tin nhắn
  async editMessage(req, res) {
    try {
      const messageId = requireObjectId(res, req.params.messageId, 'messageId', 'CHAT_INVALID_ID');
      if (!messageId) return;
      const { content } = req.body || {};
      const userId = req.user?.id || req.user?._id;

      if (typeof content !== 'string' || !content.trim()) {
        return sendServiceError(res, 400, {
          errorCode: 'CHAT_VALIDATION_ERROR',
          messageUser: 'Nội dung tin nhắn không được để trống.',
          message: 'Content is required',
        });
      }
      if (content.length > MAX_MESSAGE_CONTENT) {
        return respondContentTooLong(res);
      }

      const blocked = await rejectRoomMutationWithoutWrite(res, req, messageId);
      if (blocked) return;

      const message = await messageService.editMessage(messageId, userId, content.trim());

      if (!message) {
        return sendServiceError(res, 404, {
          errorCode: 'MESSAGE_NOT_FOUND',
          messageUser: 'Không tìm thấy tin nhắn hoặc không có quyền.',
          message: 'Message not found or unauthorized',
        });
      }

      const payloadMessage = (await attachSignedReadUrlToMessage(message)) || message;
      if (message.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_edited',
          roomId: String(message.roomId),
          payload: payloadMessage,
        });
      } else if (message.receiverId) {
        await emitDmToParticipants('friend:message_edited', payloadMessage, {
          messageId: String(messageId),
        });
      }

      res.json({
        success: true,
        message: 'Message edited successfully',
        data: payloadMessage,
      });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /** Service-to-service: xóa mọi tin nhắn kênh tổ chức (organization-service khi owner xóa org) */
  async purgeOrganizationMessagesInternal(req, res) {
    try {
      const { organizationId } = req.body || {};
      if (!organizationId || !mongoose.Types.ObjectId.isValid(String(organizationId))) {
        return res.status(400).json({ success: false, message: 'organizationId is required and must be valid' });
      }
      const oid = new mongoose.Types.ObjectId(String(organizationId));
      const result = await Message.deleteMany({ organizationId: oid });
      return res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }

  /**
   * Nội bộ: System Bot đăng tin lên kênh (dept welcome hoặc project #announcement).
   * Body: { organizationId, roomId, content?, departmentName?, refs?, activityEventId? }
   */
  async createSystemChannelMessageInternal(req, res) {
    try {
      const { organizationId, roomId, content, departmentName, refs, activityEventId } = req.body || {};
      const orgId = String(organizationId || '').trim();
      const channelId = String(roomId || '').trim();
      if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
        return res.status(400).json({ success: false, message: 'organizationId is required and must be valid' });
      }
      if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ success: false, message: 'roomId is required and must be valid' });
      }

      const eventKey = String(activityEventId || '').trim().slice(0, 120);
      if (eventKey) {
        const existing = await Message.findOne({ activityEventId: eventKey }).lean();
        if (existing) {
          const payloadExisting = (await attachSignedReadUrlToMessage(existing)) || existing;
          return res.status(200).json({ success: true, data: payloadExisting, duplicate: true });
        }
      }

      const { parseMessageRefs } = require('../utils/messageRefs');
      const parsedRefs = parseMessageRefs(refs);
      if (parsedRefs.error) {
        return res.status(400).json({ success: false, message: parsedRefs.error });
      }

      const botId = String(process.env.SYSTEM_BOT_USER_ID || '6a0000000000000000000001').trim();
      if (!mongoose.Types.ObjectId.isValid(botId)) {
        return res.status(503).json({
          success: false,
          message: 'SYSTEM_BOT_USER_ID is not a valid ObjectId',
        });
      }

      const deptLabel = String(departmentName || '').trim();
      const body =
        String(content || '').trim() ||
        (deptLabel
          ? `Chào mừng đến kênh phòng ban «${deptLabel}». Đây là không gian thông báo và phối hợp nội bộ — giao việc chính thức trên kênh dự án + bảng công việc.`
          : 'Chào mừng đến kênh phòng ban. Đây là không gian thông báo và phối hợp nội bộ — giao việc chính thức trên kênh dự án + bảng công việc.');

      const createPayload = {
        senderId: botId,
        roomId: channelId,
        organizationId: orgId,
        content: body,
        messageType: 'system',
      };
      if (parsedRefs.refs.length) {
        createPayload.refs = parsedRefs.refs;
      }
      if (eventKey) {
        createPayload.activityEventId = eventKey;
      }

      let message;
      try {
        message = await messageService.createMessage(createPayload);
      } catch (createErr) {
        // Race on unique activityEventId
        if (eventKey && isDuplicateKeyError(createErr)) {
          const again = await Message.findOne({ activityEventId: eventKey }).lean();
          if (again) {
            const payloadAgain = (await attachSignedReadUrlToMessage(again)) || again;
            return res.status(200).json({ success: true, data: payloadAgain, duplicate: true });
          }
        }
        throw createErr;
      }
      const payloadMessage = (await attachSignedReadUrlToMessage(message)) || message;

      await emitRealtimeEvent({
        event: 'room:new_message',
        roomId: channelId,
        payload: payloadMessage,
      });

      return res.status(201).json({ success: true, data: payloadMessage });
    } catch (error) {
      return chatCatchError(res, error);
    }
  }
}

module.exports = new MessageController();




