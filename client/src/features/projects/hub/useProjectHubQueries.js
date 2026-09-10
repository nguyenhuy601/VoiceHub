import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import {
  taskAPI,
  unwrapTaskApiPayload,
  unwrapTaskBoardDetailPayload,
} from '../../../services/api/taskAPI';
import {
  hubOverviewAggregateEnabled,
  unwrapChangeRequestList,
  unwrapPlanningList,
} from './projectHubUtils';
import {
  boardDetailQueryScope,
  changeRequestsFilterHash,
  mapAssignableMemberRows,
  unwrapProjectMembersList,
  unwrapProjectPayload,
} from './projectHubQueryHelpers';

export {
  boardDetailQueryScope,
  changeRequestsFilterHash,
  mapAssignableMemberRows,
  unwrapProjectMembersList,
  unwrapProjectPayload,
} from './projectHubQueryHelpers';

const STALE_PROJECT_MS = 30_000;
const STALE_BOARDS_MS = 30_000;
const STALE_ROLE_CATALOG_MS = 120_000;

function listsDetailFromFull(full) {
  if (!full || typeof full !== 'object') return null;
  return {
    board: full.board,
    lists: Array.isArray(full.lists) ? full.lists : [],
    cards: [],
    access: full.access,
  };
}

export async function fetchProjectHubProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return null;
  const res = await projectAPI.get(pid);
  return unwrapProjectPayload(res) || null;
}

export async function fetchProjectHubBoards(projectId, organizationId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const res = await projectAPI.listBoards(pid, organizationId);
  const data = unwrapProjectPayload(res);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function fetchProjectHubRoleCatalog(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const res = await projectAPI.listProjectRoles(pid);
  const data = unwrapProjectPayload(res);
  return Array.isArray(data) ? data : [];
}

export async function fetchProjectHubBoardDetail(boardId, apiCtx, { includeCards = true } = {}) {
  const bid = String(boardId || '').trim();
  if (!bid) return null;
  const res = await taskAPI.getBoardDetail(bid, {
    ...(apiCtx || {}),
    ...(includeCards ? {} : { includeCards: false }),
    skipPermissionDeniedToast: true,
    skipNotFoundToast: true,
  });
  return unwrapTaskBoardDetailPayload(res);
}

export async function fetchProjectHubSprints(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const res = await projectAPI.listSprints(pid);
  return unwrapPlanningList(res);
}

export async function fetchProjectHubPlanningItems(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const res = await projectAPI.listPlanningItems(pid);
  return unwrapPlanningList(res);
}

export async function fetchProjectHubMembers(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];
  const res = await projectAPI.listMembers(pid, {
    skipPermissionDeniedToast: true,
    skipNotFoundToast: true,
  });
  return unwrapProjectMembersList(unwrapProjectPayload(res));
}

export async function fetchProjectHubAssignableMembers(boardId, apiCtx) {
  const bid = String(boardId || '').trim();
  if (!bid) return [];
  const res = await taskAPI.getBoardAssignableMembers(bid, apiCtx || {});
  return mapAssignableMemberRows(unwrapTaskApiPayload(res));
}

export async function fetchProjectHubChangeRequests(projectId, params = {}) {
  const pid = String(projectId || '').trim();
  if (!pid) return { items: [], total: 0, page: 1, size: 20 };
  const res = await projectAPI.listChangeRequests(pid, params);
  return unwrapChangeRequestList(res);
}

/** Dedupe StrictMode / multi-caller — cùng queryKey chỉ một HTTP in-flight. */
export function ensureProjectHubProject(queryClient, projectId) {
  const pid = String(projectId || '').trim();
  if (!pid || !queryClient) return Promise.resolve(null);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.project(pid),
    queryFn: () => fetchProjectHubProject(pid),
    staleTime: STALE_PROJECT_MS,
  });
}

export function ensureProjectHubBoards(queryClient, projectId, organizationId) {
  const pid = String(projectId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!pid || !queryClient) return Promise.resolve([]);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.boards(pid, oid),
    queryFn: () => fetchProjectHubBoards(pid, oid),
    staleTime: STALE_BOARDS_MS,
  });
}

export function ensureProjectHubMembers(queryClient, projectId) {
  const pid = String(projectId || '').trim();
  if (!pid || !queryClient) return Promise.resolve([]);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.members(pid),
    queryFn: () => fetchProjectHubMembers(pid),
    staleTime: STALE_PROJECT_MS,
  });
}

export function ensureProjectHubAssignableMembers(queryClient, boardId, apiCtx) {
  const bid = String(boardId || '').trim();
  if (!bid || !queryClient) return Promise.resolve([]);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.assignableMembers(bid),
    queryFn: () => fetchProjectHubAssignableMembers(bid, apiCtx),
    staleTime: 60_000,
  });
}

export function ensureProjectHubBoardDetail(queryClient, boardId, apiCtx, { includeCards = true } = {}) {
  const bid = String(boardId || '').trim();
  if (!bid || !queryClient) return Promise.resolve(null);
  const scope = boardDetailQueryScope(includeCards);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.boardDetail(bid, scope),
    staleTime: includeCards ? 15_000 : 30_000,
    queryFn: async () => {
      if (!includeCards) {
        const full = queryClient.getQueryData(queryKeys.projectHub.boardDetail(bid, 'full'));
        const derived = listsDetailFromFull(full);
        if (derived) return derived;
      }
      const detail = await fetchProjectHubBoardDetail(bid, apiCtx, { includeCards });
      if (includeCards && detail) {
        queryClient.setQueryData(
          queryKeys.projectHub.boardDetail(bid, 'lists'),
          listsDetailFromFull(detail)
        );
      }
      return detail;
    },
  });
}

export function ensureProjectHubRoleCatalog(queryClient, projectId) {
  const pid = String(projectId || '').trim();
  if (!pid || !queryClient) return Promise.resolve([]);
  return queryClient.ensureQueryData({
    queryKey: queryKeys.projectHub.roleCatalog(pid),
    queryFn: () => fetchProjectHubRoleCatalog(pid),
    staleTime: STALE_ROLE_CATALOG_MS,
  });
}

export function useProjectHubOverview(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  const aggregateOn = hubOverviewAggregateEnabled();
  return useQuery({
    queryKey: queryKeys.projectHub.overview(pid),
    enabled: Boolean(pid) && enabled && aggregateOn,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: async () => {
      const res = await projectAPI.getOverview(pid);
      const data = unwrapProjectPayload(res);
      return data && typeof data === 'object' ? data : null;
    },
  });
}

export function useProjectHubProject(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  return useQuery({
    queryKey: queryKeys.projectHub.project(pid),
    enabled: Boolean(pid) && enabled,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubProject(pid),
  });
}

export function useProjectHubMembers(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  return useQuery({
    queryKey: queryKeys.projectHub.members(pid),
    enabled: Boolean(pid) && enabled,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubMembers(pid),
  });
}

export function useProjectHubBoardDetail(
  boardId,
  apiCtx,
  { includeCards = true, enabled = true } = {}
) {
  const queryClient = useQueryClient();
  const bid = String(boardId || '').trim();
  const scope = boardDetailQueryScope(includeCards);
  return useQuery({
    queryKey: queryKeys.projectHub.boardDetail(bid, scope),
    enabled: Boolean(bid) && enabled,
    staleTime: includeCards ? 15_000 : 30_000,
    refetchOnMount: false,
    queryFn: async () => {
      if (!includeCards) {
        const full = queryClient.getQueryData(queryKeys.projectHub.boardDetail(bid, 'full'));
        const derived = listsDetailFromFull(full);
        if (derived) return derived;
      }
      const detail = await fetchProjectHubBoardDetail(bid, apiCtx, { includeCards });
      if (includeCards && detail) {
        queryClient.setQueryData(
          queryKeys.projectHub.boardDetail(bid, 'lists'),
          listsDetailFromFull(detail)
        );
      }
      return detail;
    },
  });
}

export function useProjectHubSprints(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  return useQuery({
    queryKey: queryKeys.projectHub.sprints(pid),
    enabled: Boolean(pid) && enabled,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubSprints(pid),
  });
}

export function useProjectHubPlanningItems(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  return useQuery({
    queryKey: queryKeys.projectHub.planningItems(pid),
    enabled: Boolean(pid) && enabled,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubPlanningItems(pid),
  });
}

export function useProjectHubAssignableMembers(boardId, apiCtx, { enabled = true } = {}) {
  const bid = String(boardId || '').trim();
  return useQuery({
    queryKey: queryKeys.projectHub.assignableMembers(bid),
    enabled: Boolean(bid) && enabled,
    staleTime: 60_000,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubAssignableMembers(bid, apiCtx),
  });
}

export function useProjectHubChangeRequests(projectId, filters = {}, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  const params = {
    q: filters.q || undefined,
    type: filters.type || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    sort: filters.sort || undefined,
    page: filters.page,
    size: filters.size,
  };
  const filterHash = changeRequestsFilterHash({
    q: params.q || '',
    type: params.type || '',
    status: params.status || '',
    priority: params.priority || '',
    sort: params.sort || '',
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  return useQuery({
    queryKey: queryKeys.projectHub.changeRequests(pid, filterHash),
    enabled: Boolean(pid) && enabled,
    staleTime: STALE_PROJECT_MS,
    refetchOnMount: false,
    queryFn: () => fetchProjectHubChangeRequests(pid, params),
  });
}

/**
 * @param {string} projectId
 * @param {string} [boardId]
 * @param {{ organizationId?: string }} [opts]
 */
export function useInvalidateProjectHub() {
  const queryClient = useQueryClient();
  return useCallback(
    (projectId, boardId, opts = {}) => {
      const pid = String(projectId || '').trim();
      const bid = String(boardId || '').trim();
      const orgId = String(opts.organizationId || '').trim();
      if (pid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.overview(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.projectHub.all, 'boards', pid] });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.sprints(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.planningItems(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.members(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.changeRequestsAll(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.activity(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.files(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.roleCatalog(pid) });
      }
      if (bid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.boardDetail(bid, 'full') });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.boardDetail(bid, 'lists') });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.assignableMembers(bid) });
      }
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.listAll(orgId) });
      }
    },
    [queryClient]
  );
}
