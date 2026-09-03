import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import userService from '../services/userService';
import { unwrapApiData } from '../utils/helpers';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_USER_ME_MS } from '../lib/queryClient';

export async function fetchUserMe() {
  const res = await userService.getMe();
  return unwrapApiData(res) || res || null;
}

/**
 * Shared GET /users/me — Settings page + overview + capability tabs.
 */
export function useUserMe({ enabled: enabledProp = true } = {}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(enabledProp);

  const query = useQuery({
    queryKey: queryKeys.user.me(),
    queryFn: fetchUserMe,
    enabled,
    staleTime: STALE_TIME_USER_ME_MS,
  });

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.me() });
    return queryClient.fetchQuery({
      queryKey: queryKeys.user.me(),
      queryFn: fetchUserMe,
    });
  }, [queryClient]);

  const setMeData = useCallback(
    (profile) => {
      if (profile && typeof profile === 'object') {
        queryClient.setQueryData(queryKeys.user.me(), profile);
      }
    },
    [queryClient]
  );

  return {
    me: enabled ? query.data ?? null : null,
    loading: enabled && query.isPending,
    isError: enabled && query.isError,
    error: query.error,
    reload,
    setMeData,
    query,
  };
}

export default useUserMe;
