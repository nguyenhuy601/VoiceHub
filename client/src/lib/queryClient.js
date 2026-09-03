import { QueryClient } from '@tanstack/react-query';

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

export const GC_TIME_MS = 10 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: GC_TIME_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
