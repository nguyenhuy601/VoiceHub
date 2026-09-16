import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationAPI } from '../services/api/organizationAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_TASK_SCOPE_MS } from '../lib/queryClient';
import { buildWorkspaceCapabilities, canCreateProjectUi } from '../lib/capabilities';

function unwrapScope(payload) {
  return payload?.data?.data ?? payload?.data ?? payload ?? null;
}

export async function fetchTaskWorkspaceScope(orgId) {
  const id = String(orgId || '').trim();
  if (!id) return null;
  const res = await organizationAPI.getTaskWorkspaceScope(id);
  return unwrapScope(res);
}

/**
 * Shared task-workspace-scope — landing + hub.
 * Wave B: expose canCreateProject + capabilities.project.create (not canCreateTask for Create Project).
 * @param {string} organizationId
 * @param {{ enabled?: boolean }} [options]
 */
export default function useTaskWorkspaceScope(organizationId, options = {}) {
  const orgId = String(organizationId || '').trim();
  const enabled = options.enabled !== false && Boolean(orgId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.org.taskWorkspaceScope(orgId),
    queryFn: () => fetchTaskWorkspaceScope(orgId),
    enabled,
    staleTime: STALE_TIME_TASK_SCOPE_MS,
  });

  const scope = enabled ? query.data ?? null : null;
  const loading = Boolean(enabled) && query.isPending;
  const canCreateTask = Boolean(scope?.canCreateTask);
  const canCreateProject = Object.prototype.hasOwnProperty.call(scope || {}, 'canCreateProject')
    ? Boolean(scope.canCreateProject)
    : canCreateTask;
  const capabilities = buildWorkspaceCapabilities(scope || {});

  const reload = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.org.taskWorkspaceScope(orgId),
    });
  }, [orgId, queryClient]);

  return {
    scope,
    canCreateTask,
    canCreateProject,
    capabilities,
    canCreateProjectCapability: canCreateProjectUi(capabilities),
    loading,
    isError: Boolean(enabled) && query.isError,
    error: query.error,
    reload,
    query,
  };
}
