import apiClient from '../services/api/apiClient';
import { pickAvatarValue } from './avatarDisplay';
import { getResolvedBearerToken } from './tokenStorage';

const CACHE_TTL_MS = Math.min(
  10 * 60 * 1000,
  Math.max(60 * 1000, parseInt(import.meta.env.VITE_AVATAR_CACHE_TTL_MS || '300000', 10) || 300000)
);
const CACHE_MAX_ENTRIES = 64;

/** key -> Promise<Blob> */
const inflight = new Map();
/** key -> { blob, expiresAt } */
const blobCache = new Map();

export function isProtectedUploadPath(value) {
  const raw = pickAvatarValue(value) || String(value || '').trim();
  if (!raw) return false;
  return /\/uploads\//i.test(raw);
}

function uploadPathFromAvatar(avatar) {
  const raw = pickAvatarValue(avatar) || String(avatar || '').trim();
  if (!raw) return '';
  let path = raw.replace(/^https?:\/\/[^/]+/i, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path.split('?')[0];
}

export function avatarFetchCacheKey({ userId, avatar, cacheBust } = {}) {
  const bust = cacheBust != null && cacheBust !== '' ? String(cacheBust) : '';
  const uid = String(userId || '').trim();
  if (uid) return `user:${uid}:${bust}`;
  const path = uploadPathFromAvatar(avatar);
  if (path) return `path:${path}:${bust}`;
  return '';
}

function pruneBlobCache() {
  const now = Date.now();
  for (const [key, entry] of blobCache.entries()) {
    if (!entry || entry.expiresAt <= now) blobCache.delete(key);
  }
  while (blobCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = blobCache.keys().next().value;
    if (oldestKey == null) break;
    blobCache.delete(oldestKey);
  }
}

function readCachedBlob(key) {
  if (!key) return null;
  const entry = blobCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    blobCache.delete(key);
    return null;
  }
  return entry.blob;
}

function writeCachedBlob(key, blob) {
  if (!key || !(blob instanceof Blob)) return;
  pruneBlobCache();
  blobCache.set(key, { blob, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Xóa cache sau upload avatar mới (profile modal). */
export function invalidateProtectedAvatarCache({ userId, avatar, cacheBust } = {}) {
  const key = avatarFetchCacheKey({ userId, avatar, cacheBust });
  if (key) blobCache.delete(key);
  if (userId) {
    const prefix = `user:${String(userId).trim()}:`;
    for (const k of blobCache.keys()) {
      if (k.startsWith(prefix)) blobCache.delete(k);
    }
  }
}

async function fetchUserAvatarBlob(userId, cacheBust) {
  const qs = cacheBust ? `?v=${encodeURIComponent(String(cacheBust))}` : '';
  const res = await apiClient.get(`/users/${encodeURIComponent(String(userId))}/avatar${qs}`, {
    responseType: 'blob',
    skipGlobalErrorHandling: true,
  });
  return res instanceof Blob ? res : res?.data;
}

async function fetchUploadPathBlob(avatar, cacheBust) {
  const path = uploadPathFromAvatar(avatar);
  if (!path || !/\/uploads\//i.test(path)) {
    throw new Error('Protected avatar path required');
  }

  const token = getResolvedBearerToken();
  if (!token) {
    throw new Error('Unauthorized');
  }

  let url = `${window.location.origin}${path}`;
  if (cacheBust) {
    url += `${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheBust))}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Avatar fetch failed: ${res.status}`);
  }
  return res.blob();
}

async function loadProtectedAvatarBlob({ userId, avatar, cacheBust } = {}) {
  const uid = String(userId || '').trim();
  if (uid) {
    return fetchUserAvatarBlob(uid, cacheBust);
  }
  return fetchUploadPathBlob(avatar, cacheBust);
}

/**
 * Tải avatar với JWT — ưu tiên GET /api/users/:id/avatar (không dính rate-limit /uploads).
 * Dedupe in-flight + cache blob ngắn hạn để tránh 429 khi nhiều UserAvatar cùng user.
 */
export async function fetchProtectedAvatarBlob(params = {}) {
  const key = avatarFetchCacheKey(params);
  if (!key) {
    throw new Error('Avatar fetch key required');
  }

  const cached = readCachedBlob(key);
  if (cached) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const flight = loadProtectedAvatarBlob(params)
    .then((blob) => {
      if (blob instanceof Blob) writeCachedBlob(key, blob);
      return blob;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, flight);
  return flight;
}
