import { QueryClient, onlineManager } from '@tanstack/react-query';
import {
  ensureNetworkControllerStarted,
  networkController,
  NETWORK_STATE,
} from './network/networkController.js';

ensureNetworkControllerStarted();

/** Keep React Query in sync with NetworkController (pauses refetchInterval when OFFLINE). */
onlineManager.setEventListener((setOnline) => {
  setOnline(networkController.getState() !== NETWORK_STATE.OFFLINE);
  return networkController.subscribe((state) => {
    setOnline(state !== NETWORK_STATE.OFFLINE);
  });
});

/** Badge khi socket chưa kết nối — khi connected dùng snapshot `notification:unread_updated` */
export const STALE_TIME_BADGE_MS = 30_000;

/** Danh sách org — ít đổi hơn */
export const STALE_TIME_ORGS_MS = 120_000;

/** Danh sách bạn — trung bình */
export const STALE_TIME_FRIENDS_MS = 60_000;

/** Dashboard BFF — khớp TTL cache gateway (~45s) */
export const STALE_TIME_DASHBOARD_MS = 30_000;

/** Requirement access — sidebar + page share; ít đổi hơn list packs */
export const STALE_TIME_REQUIREMENT_ACCESS_MS = 60_000;

/** Requirement packs list — workspace + AI wizard; invalidate sau mutate */
export const STALE_TIME_REQUIREMENT_PACKS_MS = 30_000;

/** Master grants V2 — admin sidebar + page + panel share */
export const STALE_TIME_RBAC_GRANTS_MS = 60_000;

/** Org structure levels — sidebar + create panels */
export const STALE_TIME_ORG_LEVELS_MS = 120_000;

/** Org structure tree — list / channels / voice */
export const STALE_TIME_ORG_STRUCTURE_MS = 60_000;

/** RBAC catalog tree — ít đổi */
export const STALE_TIME_RBAC_CATALOG_MS = 300_000;

/** Org detail — layout + settings */
export const STALE_TIME_ORG_DETAIL_MS = 60_000;

/** Collaborate projects list — landing */
export const STALE_TIME_PROJECTS_LIST_MS = 30_000;

/** Task workspace scope — canCreateTask */
export const STALE_TIME_TASK_SCOPE_MS = 60_000;

/** Meetings list — picker + panel */
export const STALE_TIME_ADMIN_MEETINGS_MS = 15_000;

/** Current user profile — settings tabs share */
export const STALE_TIME_USER_ME_MS = 60_000;

/** Calendar feed — khớp Redis TTL calendar BE (~90s) */
export const STALE_TIME_CALENDAR_MS = 45_000;

export const GC_TIME_MS = 10 * 60_000;

function isNetworkishQueryError(error) {
  const code = String(error?.code || '');
  return (
    code === 'NETWORK_OFFLINE' ||
    code === 'ERR_NETWORK' ||
    code === 'ERR_EMPTY_RESPONSE' ||
    code === 'ECONNABORTED' ||
    Boolean(error?.isNetworkOffline)
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: GC_TIME_MS,
      refetchOnWindowFocus: false,
      networkMode: 'online',
      // Transport retry lives on axios; RQ only one soft retry for non-network failures.
      retry: (failureCount, error) => {
        if (networkController.shouldBlockRequests()) return false;
        if (isNetworkishQueryError(error)) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      networkMode: 'online',
      retry: false,
    },
  },
});
