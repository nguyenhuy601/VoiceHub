import roleAPI from '../services/api/roleAPI';
import { normalizeRoleId, unwrapList } from '../utils/adminRbacUtils';

const EMPTY_ROLES_SNAPSHOT = Object.freeze({
  roles: [],
  loading: false,
  version: 0,
  error: null,
});

/** @type {Map<string, object>} */
const stores = new Map();

const invalidateTimers = new Map();

function normalizeOrgId(orgId) {
  return String(orgId || '').trim();
}

function rebuildSnapshot(store) {
  store.cachedSnapshot = {
    roles: store.roles,
    loading: store.loading,
    version: store.version,
    error: store.error,
  };
}

function getStore(orgId) {
  const key = normalizeOrgId(orgId);
  if (!key) return null;
  if (!stores.has(key)) {
    const store = {
      roles: [],
      loading: false,
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

export function subscribeAdminRoles(orgId, listener) {
  const store = getStore(orgId);
  if (!store) return () => {};
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function getAdminRolesSnapshot(orgId) {
  const store = getStore(orgId);
  if (!store) return EMPTY_ROLES_SNAPSHOT;
  return store.cachedSnapshot;
}

export async function fetchAdminRoles(orgId, { t, showError = true } = {}) {
  const key = normalizeOrgId(orgId);
  const store = getStore(key);
  if (!store) return;

  if (store.fetchPromise) {
    await store.fetchPromise;
    return;
  }

  store.loading = true;
  store.error = null;
  emit(store);

  store.fetchPromise = (async () => {
    try {
      const res = await roleAPI.getRolesByOrganization(key);
      const list = unwrapList(res);
      store.roles = Array.isArray(list) ? list : [];
    } catch (error) {
      store.error = error;
      store.roles = [];
      if (showError && t) {
        const { resolveApiErrorMessage } = await import('../utils/resolveApiErrorMessage');
        const toast = (await import('react-hot-toast')).default;
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.loadFail') }));
      }
    } finally {
      store.loading = false;
      store.fetchPromise = undefined;
      emit(store);
    }
  })();

  await store.fetchPromise;
}

export function removeAdminRole(orgId, roleId) {
  const id = String(roleId || '').trim();
  if (!id) return;
  const store = getStore(orgId);
  if (!store) return;
  store.roles = store.roles.filter((role) => normalizeRoleId(role) !== id);
  emit(store);
}

export function invalidateAdminRoles(orgId, { debounceMs = 300 } = {}) {
  const key = normalizeOrgId(orgId);
  if (!key) return;

  const existing = invalidateTimers.get(key);
  if (existing) clearTimeout(existing);

  invalidateTimers.set(
    key,
    setTimeout(() => {
      invalidateTimers.delete(key);
      fetchAdminRoles(key, { showError: false }).catch(() => null);
    }, debounceMs)
  );
}
