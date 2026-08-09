import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_DASHBOARD_MS } from '../../lib/queryClient';
import { fetchDashboardSummary } from '../../services/dashboardService';

export function useDashboardSummary({
  enabled: enabledProp = true,
  orgId = '',
  role = '',
} = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;

  return useQuery({
    queryKey: queryKeys.dashboard.summary(orgId, role),
    queryFn: fetchDashboardSummary,
    staleTime: STALE_TIME_DASHBOARD_MS,
    refetchInterval: enabled ? 45_000 : false,
    refetchOnWindowFocus: true,
    enabled,
  });
}
