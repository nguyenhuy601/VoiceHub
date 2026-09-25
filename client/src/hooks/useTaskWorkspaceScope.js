import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationAPI } from '../services/api/organizationAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_TASK_SCOPE_MS } from '../lib/queryClient';
import { buildWorkspaceCapabilities, canCreateProjectUi } from '../lib/capabilities';
import { useEffectiveMasterGrants } from './useEffectiveMasterGrants';

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
 * Wave B: expose canCreateProject + capabilities.project.create (AND master grant).
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

  const {
    grants,
    loading: grantsLoading,
    error: grantsError,
    reload: reloadGrants,
  } = useEffectiveMasterGrants(enabled ? orgId : '');

  const scope = enabled ? query.data ?? null : null;
  const scopeLoading = Boolean(enabled) && query.isPending;
  const loading = scopeLoading || Boolean(enabled && grantsLoading);

  const canCreateTask = Boolean(scope?.canCreateTask);
  const canCreateProject = Object.prototype.hasOwnProperty.call(scope || {}, 'canCreateProject')
    ? Boolean(scope.canCreateProject)
    : canCreateTask;

  const grantsResolved = Boolean(enabled && !grantsLoading && !grantsError);

  const capabilities = useMemo(
    () =>
      buildWorkspaceCapabilities({
        ...(scope || {}),
        // Only pass masterGrants once RPS settled — empty resolved list = deny create.
        ...(grantsResolved ? { masterGrants: grants } : {}),
        ...(grantsError ? { grantsError: true } : {}),
      }),
    [scope, grants, grantsResolved, grantsError]
  );

  // Fail closed while grants/scope still loading — avoid brief false-allow on capability alone.
  const canCreateProjectCapability = Boolean(
    !loading && !grantsError && canCreateProjectUi(capabilities)
  );

  const reload = useCallback(async () => {
    if (!orgId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.taskWorkspaceScope(orgId),
      }),
      reloadGrants(),
    ]);
  }, [orgId, queryClient, reloadGrants]);

  return {
    scope,
    canCreateTask,
    canCreateProject,
    capabilities,
    canCreateProjectCapability,
    loading,
    isError: Boolean(enabled) && (query.isError || grantsError),
    error: query.error,
    reload,
    query,
  };
}
