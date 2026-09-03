import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import {
  taskAPI,
  unwrapTaskBoardDetailPayload,
} from '../../../services/api/taskAPI';
import { hubOverviewAggregateEnabled } from './projectHubUtils';

function unwrapProjectPayload(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export function useProjectHubOverview(projectId, { enabled = true } = {}) {
  const pid = String(projectId || '').trim();
  const aggregateOn = hubOverviewAggregateEnabled();
  return useQuery({
    queryKey: queryKeys.projectHub.overview(pid),
    enabled: Boolean(pid) && enabled && aggregateOn,
    staleTime: 30_000,
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
    staleTime: 30_000,
    queryFn: async () => {
      const res = await projectAPI.get(pid);
      return unwrapProjectPayload(res) || null;
    },
  });
}

export function useProjectHubBoardDetail(boardId, apiCtx, { includeCards = true, enabled = true } = {}) {
  const bid = String(boardId || '').trim();
  const scope = includeCards ? 'full' : 'lists';
  return useQuery({
    queryKey: queryKeys.projectHub.boardDetail(bid, scope),
    enabled: Boolean(bid) && enabled,
    staleTime: includeCards ? 15_000 : 30_000,
    queryFn: async () => {
      const res = await taskAPI.getBoardDetail(bid, {
        ...(apiCtx || {}),
        ...(includeCards ? {} : { includeCards: false }),
      });
      return unwrapTaskBoardDetailPayload(res);
    },
  });
}

export function useInvalidateProjectHub() {
  const queryClient = useQueryClient();
  return useCallback(
    (projectId, boardId) => {
      const pid = String(projectId || '').trim();
      const bid = String(boardId || '').trim();
      if (pid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.overview(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.sprints(pid) });
      }
      if (bid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.boardDetail(bid, 'full') });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.boardDetail(bid, 'lists') });
      }
    },
    [queryClient]
  );
}
