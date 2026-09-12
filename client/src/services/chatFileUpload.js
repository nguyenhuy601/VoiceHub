/**
 * Upload file/hình cho chat: ưu tiên proxy same-origin (/messages/storage/upload),
 * fallback signed URL nếu proxy không khả dụng.
 * Hiển thị trong chat: `components/Chat/ChatFileAttachment.jsx`.
 *
 * options.signal / options.timeoutMs — hủy khi treo (vd progress kẹt ~86% chờ server ack).
 */

/** Khớp SC-P0-03: toast lỗi rõ trong ≤ 20s khi upload treo (vd kẹt ~86%). */
export const CHAT_UPLOAD_DEFAULT_TIMEOUT_MS = 20_000;

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

function isAbortError(err) {
  const name = String(err?.name || '');
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    name === 'AbortError' ||
    name === 'CanceledError' ||
    code === 'ERR_CANCELED' ||
    code === 'UPLOAD_ABORTED' ||
    msg.includes('aborted') ||
    msg.includes('canceled') ||
    msg.includes('cancelled')
  );
}

export function createUploadTimeoutError() {
  const err = new Error('UPLOAD_TIMEOUT');
  err.code = 'UPLOAD_TIMEOUT';
  err.name = 'AbortError';
  return err;
}

/**
 * Proxy 5xx thường là MinIO down — vẫn thử signed URL (Firebase) trước khi fail.
 * CORS signed URL có thể fail trên voicehub.local; khi đó ném lỗi gốc (messageUser).
 */
async function uploadWithProxyThenSignedFallback(
  api,
  file,
  resolvedMime,
  retentionContext,
  onProgress,
  signal
) {
  try {
    return await uploadViaStorageProxy(
      api,
      file,
      resolvedMime,
      retentionContext,
      onProgress,
      signal
    );
  } catch (proxyErr) {
    if (isAbortError(proxyErr) || signal?.aborted) throw proxyErr;
    try {
      return await uploadViaSignedUrl(
        api,
        file,
        resolvedMime,
        retentionContext,
        onProgress,
        signal
      );
    } catch (signedErr) {
      if (isAbortError(signedErr) || signal?.aborted) throw signedErr;
      throw proxyErr;
    }
  }
}

/**
 * PUT file lên signed URL với tiến trình (fetch không hỗ trợ upload progress).
 */
function putFileWithProgress(url, file, contentType, onProgress, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createUploadTimeoutError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      xhr.abort();
      reject(createUploadTimeoutError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else reject(new Error(`Upload Storage thất bại (${xhr.status})`));
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Upload Storage: lỗi mạng'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(createUploadTimeoutError());
    };
    xhr.send(file);
  });
}

/**
 * Upload qua proxy same-origin — tránh PUT trực tiếp lên GCS/Firebase (403 trên voicehub.local).
 * @returns {Promise<{ storagePath: string, storageBackend?: string }>}
 */
async function uploadViaStorageProxy(api, file, resolvedMime, retentionContext, onProgress, signal) {
  onProgress?.(5);
  const payload = await api.post('/messages/storage/upload', file, {
    headers: {
      'Content-Type': resolvedMime,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Mime-Type': resolvedMime,
      'X-Retention-Context': retentionContext,
    },
    signal,
    onUploadProgress: (event) => {
      if (event.total && typeof onProgress === 'function') {
        const pct = Math.round((event.loaded / event.total) * 85);
        onProgress(pct);
        // Body xong — chờ server ack (storagePath); tránh UI kẹt 85%.
        if (event.loaded >= event.total) onProgress(86);
      }
    },
    transformRequest: [(data) => data],
  });
  if (signal?.aborted) throw createUploadTimeoutError();
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
async function uploadViaSignedUrl(api, file, resolvedMime, retentionContext, onProgress, signal) {
  onProgress?.(2);
  const signedRes = await api.post(
    '/messages/storage/signed-upload',
    {
      fileName: file.name,
      mimeType: resolvedMime,
      size: file.size,
      retentionContext,
    },
    { signal }
  );

  if (signal?.aborted) throw createUploadTimeoutError();

  const payload = signedRes?.data ?? signedRes;
  const data = payload?.data ?? payload;
  if (!data?.uploadUrl || !data?.storagePath) {
    throw new Error(signedRes?.message || payload?.message || 'Không lấy được signed URL');
  }

  onProgress?.(12);
  try {
    await putFileWithProgress(data.uploadUrl, file, resolvedMime, (uploadPct) => {
      onProgress?.(12 + Math.round((uploadPct / 100) * 73));
    }, signal);
  } catch (err) {
    if (isAbortError(err)) throw err;
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
 * @param {{ retentionContext: 'dm'|'org_room'|'meeting', receiverId?: string, roomId?: string, organizationId?: string, caption?: string, replyToMessageId?: string, signal?: AbortSignal, timeoutMs?: number }} options
 * @param {(percent: number) => void} [onProgress] — 0–100 (gồm lấy URL + upload + tạo tin)
 */
export async function uploadChatFileAndCreateMessage(api, file, options, onProgress) {
  const {
    retentionContext,
    receiverId,
    roomId,
    organizationId,
    caption,
    replyToMessageId,
    signal: externalSignal,
    timeoutMs = CHAT_UPLOAD_DEFAULT_TIMEOUT_MS,
  } = options;

  const resolvedMime =
    file.type || guessMimeFromFileName(file.name) || 'application/octet-stream';

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) throw createUploadTimeoutError();
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  let timer = null;
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const uploaded = await uploadWithProxyThenSignedFallback(
      api,
      file,
      resolvedMime,
      retentionContext,
      onProgress,
      controller.signal
    );
    const storagePath = uploaded.storagePath;

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
    const msgRes = await api.post('/messages', body, { signal: controller.signal });
    onProgress?.(100);
    const msgPayload = msgRes?.data ?? msgRes;
    const msg = msgPayload?.data ?? msgPayload;
    if (msg?.fileMeta && storagePath && !msg.fileMeta.storagePath) {
      msg.fileMeta = { ...msg.fileMeta, storagePath };
    }
    return msg;
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) {
      throw createUploadTimeoutError();
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
