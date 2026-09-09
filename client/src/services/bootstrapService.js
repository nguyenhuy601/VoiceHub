import api from './api';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { unwrapApiData } from '../utils/helpers';
import { normalizeSuite, suiteToSegment } from '../utils/suitePathUtils';
import { writeBootstrapCompanyFlags } from '../utils/singleCompanyMode';

let inflightBootstrap = null;
let inflightBootstrapKey = '';
/** Last successful shell bootstrap (no suite) — Sync apply without 2nd HTTP. */
let lastShellBootstrapPayload = null;

/**
 * GET /api/bootstrap — shell gom user, orgs, badges (gateway BFF).
 * Dedupe in-flight (React StrictMode mount 2 lần).
 */
export async function fetchBootstrap({ suite } = {}) {
  const suiteKey = suite ? suiteToSegment(normalizeSuite(suite)) : 'default';
  const requestKey = suiteKey;
  if (inflightBootstrap && inflightBootstrapKey === requestKey) return inflightBootstrap;

  const params = suiteKey !== 'default' ? { suite: suiteKey } : undefined;
  inflightBootstrapKey = requestKey;
  inflightBootstrap = api
    .get('/bootstrap', { params, skipGlobalErrorHandling: true })
    .then((res) => unwrapApiData(res) ?? res)
    .finally(() => {
      inflightBootstrap = null;
      inflightBootstrapKey = '';
    });

  return inflightBootstrap;
}

/**
 * Hydrate React Query cache từ bootstrap — sidebar/dashboard bỏ fetch trùng.
 */
export function hydrateBootstrapCache(payload) {
  if (!payload || typeof payload !== 'object') return;

  writeBootstrapCompanyFlags(payload);

  if (Array.isArray(payload.organizations)) {
    queryClient.setQueryData(queryKeys.organizations.my(), payload.organizations, {
      updatedAt: Date.now(),
    });
  }

  if (payload.badges && typeof payload.badges === 'object') {
    queryClient.setQueryData(
      queryKeys.notifications.badge('personal', ''),
      { unreadCount: Number(payload.badges.notificationsUnreadPersonal) || 0 },
      { updatedAt: Date.now() }
    );
  }

  if (Array.isArray(payload.friendsPending)) {
    queryClient.setQueryData(queryKeys.friends.pending(), payload.friendsPending, {
      updatedAt: Date.now(),
    });
  }
}

/** Payload shell gần nhất (sau loadBootstrapShell không suite). */
export function getLastBootstrapShellPayload() {
  return lastShellBootstrapPayload;
}

/** Gọi bootstrap và hydrate cache (sau auth/me). Auth path: không truyền suite. */
export async function loadBootstrapShell(options = {}) {
  const data = await fetchBootstrap(options);
  hydrateBootstrapCache(data);
  const suiteKey = options?.suite ? suiteToSegment(normalizeSuite(options.suite)) : 'default';
  if (suiteKey === 'default' && data && typeof data === 'object') {
    lastShellBootstrapPayload = data;
  }
  return data;
}
