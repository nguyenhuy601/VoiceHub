import { organizationAPI } from '../services/api/organizationAPI';
import { memberUserId, unwrapApi } from '../utils/adminUserUtils';

const EMPTY_MEMBERS_SNAPSHOT = Object.freeze({
  members: [],
  roles: [],
  membersByIdAll: new Map(),
  loading: false,
  version: 0,
  error: null,
  hydratedView: null,
});

const VIEW_DIRECTORY = 'directory';
const VIEW_ADMIN_TABLE = 'admin_table';

/** @type {Map<string, object>} */
const stores = new Map();

const invalidateTimers = new Map();

function normalizeOrgId(orgId) {
  return String(orgId || '').trim();
}

function normalizeView(view) {
  const v = String(view || '').trim().toLowerCase();
  return v === VIEW_DIRECTORY ? VIEW_DIRECTORY : VIEW_ADMIN_TABLE;
}

function viewRank(view) {
  return normalizeView(view) === VIEW_ADMIN_TABLE ? 2 : 1;
}

function buildMembersByIdAll(all) {
  const byId = new Map();
  for (const m of all) {
    const id = memberUserId(m);
    if (id) byId.set(id, m);
  }
  return byId;
}

function applyMembersPayload(store, bundle) {
  const list = bundle?.members || bundle;
  const all = Array.isArray(list) ? list : [];
  store.members = all;
  store.roles = Array.isArray(bundle?.roles) ? bundle.roles : [];
  store.membersByIdAll = buildMembersByIdAll(all);
}

function rebuildSnapshot(store) {
  store.cachedSnapshot = {
    members: store.members,
    roles: store.roles,
    membersByIdAll: store.membersByIdAll,
    loading: store.loading,
    version: store.version,
    error: store.error,
    hydratedView: store.hydratedView,
  };
}

function getStore(orgId) {
  const key = normalizeOrgId(orgId);
  if (!key) return null;
  if (!stores.has(key)) {
    const store = {
      members: [],
      roles: [],
      membersByIdAll: new Map(),
      loading: false,
      hydrated: false,
      hydratedView: null,
      version: 0,
      error: null,
      listeners: new Set(),
      cachedSnapshot: null,
      fetchPromise: undefined,
    };
    rebuildSnapshot(store);
    stores.set(key, store);
  }
  return stores.get(key);
}

function emit(store) {
  store.version += 1;
  rebuildSnapshot(store);
  for (const listener of store.listeners) {
    listener();
  }
}

export function subscribeAdminMembers(orgId, listener) {
  const store = getStore(orgId);
  if (!store) return () => {};
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function getAdminMembersSnapshot(orgId) {
  const store = getStore(orgId);
  if (!store) return EMPTY_MEMBERS_SNAPSHOT;
  return store.cachedSnapshot;
}

/**
 * @param {string} orgId
 * @param {{ t?: Function, showError?: boolean, force?: boolean, view?: 'directory'|'admin_table' }} [options]
 */
export async function fetchAdminMembers(
  orgId,
  { t, showError = true, force = false, view = VIEW_ADMIN_TABLE } = {}
) {
  const key = normalizeOrgId(orgId);
  const store = getStore(key);
  if (!store) return;

  const requestedRaw = normalizeView(view);
  // Không hạ cấp admin_table → directory khi layout/realtime force refresh count-only.
  let requested = requestedRaw;
  if (
    force &&
    store.hydrated &&
    viewRank(store.hydratedView) > viewRank(requestedRaw)
  ) {
    requested = normalizeView(store.hydratedView);
  }

  if (store.fetchPromise) {
    await store.fetchPromise;
  }

  // Cache hit: admin_table phục vụ được directory; directory không đủ cho admin_table.
  if (!force && store.hydrated && viewRank(store.hydratedView) >= viewRank(requested)) {
    return;
  }

  store.loading = true;
  store.error = null;
  emit(store);

  store.fetchPromise = (async () => {
    try {
      const res = await organizationAPI.getMembersWithRoles(key, { view: requested });
      const data = unwrapApi(res);
      const bundle = data?.data ?? data;
      applyMembersPayload(store, bundle);
      store.hydrated = true;
      store.hydratedView = requested;
    } catch (error) {
      store.error = error;
      store.members = [];
      store.roles = [];
      store.membersByIdAll = new Map();
      store.hydrated = false;
      store.hydratedView = null;
      if (showError && t) {
        const { resolveApiErrorMessage } = await import('../utils/resolveApiErrorMessage');
        const toast = (await import('react-hot-toast')).default;
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') })
        );
      }
    } finally {
      store.loading = false;
      store.fetchPromise = undefined;
      emit(store);
    }
  })();

  await store.fetchPromise;
}

export function patchAdminMembers(orgId, updater) {
  const store = getStore(orgId);
  if (!store || typeof updater !== 'function') return;
  const next = updater({
    members: store.members,
    roles: store.roles,
    membersByIdAll: store.membersByIdAll,
  });
  if (next?.members) store.members = next.members;
  if (next?.roles) store.roles = next.roles;
  if (next?.membersByIdAll) store.membersByIdAll = next.membersByIdAll;
  emit(store);
}

export function removeAdminMember(orgId, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  patchAdminMembers(orgId, ({ members, membersByIdAll }) => {
    const nextAll = new Map(membersByIdAll);
    nextAll.delete(uid);
    return {
      members: members.filter((m) => memberUserId(m) !== uid),
      membersByIdAll: nextAll,
    };
  });
}

export function invalidateAdminMembers(orgId, { debounceMs = 300, view } = {}) {
  const key = normalizeOrgId(orgId);
  if (!key) return;

  const existing = invalidateTimers.get(key);
  if (existing) clearTimeout(existing);

  invalidateTimers.set(
    key,
    setTimeout(() => {
      invalidateTimers.delete(key);
      const store = getStore(key);
      // Giữ rank đã hydrate (admin_table nếu từng cần RBAC); mặc định directory.
      const refreshView = normalizeView(
        view || store?.hydratedView || VIEW_DIRECTORY
      );
      fetchAdminMembers(key, { showError: false, force: true, view: refreshView }).catch(() => null);
    }, debounceMs)
  );
}

export function getAdminMembersCount(orgId) {
  const store = getStore(orgId);
  if (!store) return 0;
  return store.members.length;
}

export { VIEW_ADMIN_TABLE, VIEW_DIRECTORY };
