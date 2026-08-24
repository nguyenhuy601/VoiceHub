/**
 * Upload file/hình cho chat: ưu tiên proxy same-origin (/messages/storage/upload),
 * fallback signed URL nếu proxy không khả dụng.
 * Hiển thị trong chat: `components/Chat/ChatFileAttachment.jsx`.
 */

/**
 * Một số trình duyệt/OS để trống `file.type`; map theo đuôi để server nhận MIME chuẩn.
 * @param {string} name
 */
function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (n.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.txt')) return 'text/plain';
  return '';
}

function isProxyUploadFailure(err) {
  const status = Number(err?.response?.status || err?.status || 0);
  if (status >= 500 || status === 503) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('storage') && (msg.includes('minio') || msg.includes('503'));
}

/**
 * PUT file lên signed URL với tiến trình (fetch không hỗ trợ upload progress).
 */
function putFileWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else reject(new Error(`Upload Storage thất bại (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload Storage: lỗi mạng'));
    xhr.send(file);
  });
}

/**
 * Upload qua proxy same-origin — tránh PUT trực tiếp lên GCS/Firebase (403 trên voicehub.local).
 * @returns {Promise<{ storagePath: string, storageBackend?: string }>}
 */
async function uploadViaStorageProxy(api, file, resolvedMime, retentionContext, onProgress) {
  onProgress?.(5);
  const payload = await api.post('/messages/storage/upload', file, {
    headers: {
      'Content-Type': resolvedMime,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Mime-Type': resolvedMime,
      'X-Retention-Context': retentionContext,
    },
    onUploadProgress: (event) => {
      if (event.total && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 85));
      }
    },
    transformRequest: [(data) => data],
  });
  const data = payload?.data ?? payload;
  if (!data?.storagePath) {
    throw new Error(payload?.message || 'Không lấy được storagePath từ proxy upload');
  }
  onProgress?.(88);
  return {
    storagePath: String(data.storagePath),
    storageBackend: data.storageBackend || undefined,
  };
}

/**
 * Fallback: signed URL từ server → PUT lên Firebase/GCS.
 * @returns {Promise<{ storagePath: string }>}
 */
async function uploadViaSignedUrl(api, file, resolvedMime, retentionContext, onProgress) {
  onProgress?.(2);
  const signedRes = await api.post('/messages/storage/signed-upload', {
    fileName: file.name,
    mimeType: resolvedMime,
    size: file.size,
    retentionContext,
  });

  const payload = signedRes?.data ?? signedRes;
  const data = payload?.data ?? payload;
  if (!data?.uploadUrl || !data?.storagePath) {
    throw new Error(signedRes?.message || payload?.message || 'Không lấy được signed URL');
  }

  onProgress?.(12);
  try {
    await putFileWithProgress(data.uploadUrl, file, resolvedMime, (uploadPct) => {
      onProgress?.(12 + Math.round((uploadPct / 100) * 73));
    });
  } catch (err) {
    const isNetwork =
      err?.name === 'TypeError' ||
      String(err?.message || '').toLowerCase().includes('failed to fetch') ||
      String(err?.message || '').toLowerCase().includes('lỗi mạng');
    if (isNetwork) {
      throw new Error(
        'Upload Storage: trình duyệt không gọi được URL (thường do CORS chưa cấu hình trên bucket Firebase/GCS). ' +
          'Chạy: gsutil cors set docs/firebase-storage-cors.json gs://<FIREBASE_STORAGE_BUCKET> — chi tiết trong docs/FIREBASE_STORAGE.md'
      );
    }
    throw err;
  }

  onProgress?.(88);
  return { storagePath: String(data.storagePath) };
}

/**
 * @param {import('axios').AxiosInstance} api
 * @param {File} file
 * @param {{ retentionContext: 'dm'|'org_room'|'meeting', receiverId?: string, roomId?: string, organizationId?: string, caption?: string, replyToMessageId?: string }} options
 * @param {(percent: number) => void} [onProgress] — 0–100 (gồm lấy URL + upload + tạo tin)
 */
export async function uploadChatFileAndCreateMessage(api, file, options, onProgress) {
  const { retentionContext, receiverId, roomId, organizationId, caption, replyToMessageId } =
    options;

  const resolvedMime =
    file.type || guessMimeFromFileName(file.name) || 'application/octet-stream';

  let storagePath;
  try {
    const uploaded = await uploadViaStorageProxy(
      api,
      file,
      resolvedMime,
      retentionContext,
      onProgress
    );
    storagePath = uploaded.storagePath;
  } catch (proxyErr) {
    if (isProxyUploadFailure(proxyErr)) {
      throw proxyErr;
    }
    const uploaded = await uploadViaSignedUrl(
      api,
      file,
      resolvedMime,
      retentionContext,
      onProgress
    );
    storagePath = uploaded.storagePath;
  }

  const isImage = (file.type || resolvedMime || '').startsWith('image/');
  const messageType = isImage ? 'image' : 'file';
  const captionText = String(caption || '').trim();

  const body = {
    content: captionText || file.name,
    messageType,
    fileMeta: {
      storagePath,
      originalName: file.name,
      mimeType: resolvedMime,
      byteSize: file.size,
      retentionContext,
    },
  };
  if (receiverId) body.receiverId = receiverId;
  if (roomId) body.roomId = roomId;
  if (organizationId) body.organizationId = organizationId;
  if (replyToMessageId) body.replyToMessageId = String(replyToMessageId);

  onProgress?.(92);
  const msgRes = await api.post('/messages', body);
  onProgress?.(100);
  const msgPayload = msgRes?.data ?? msgRes;
  const msg = msgPayload?.data ?? msgPayload;
  if (msg?.fileMeta && storagePath && !msg.fileMeta.storagePath) {
    msg.fileMeta = { ...msg.fileMeta, storagePath };
  }
  return msg;
}
