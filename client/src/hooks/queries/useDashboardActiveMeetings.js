import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_DASHBOARD_MS } from '../../lib/queryClient';
import { meetingAPI } from '../../services/api/meetingAPI';

async function fetchActiveMeetingsCount() {
  const activeMeetingRes = await meetingAPI.getMeetings({ status: 'active', limit: 50 });
  const activeBody = activeMeetingRes?.data ?? activeMeetingRes;
  const activeInner = activeBody?.data ?? activeBody;
  const activeRows = activeInner?.meetings ?? activeInner?.data?.meetings ?? activeInner?.items;
  return Array.isArray(activeRows) ? activeRows.length : 0;
}

/**
 * Fallback khi GET /dashboard/summary không có activeVoiceMeetings.
 * Dedupe qua React Query — không gọi lại khi friends/notifications refetch.
 */
export function useDashboardActiveMeetings({
  enabled: enabledProp = true,
  summaryActiveVoiceMeetings = null,
} = {}) {
  const { isAuthenticated } = useAuth();
  const hasSummaryField = Number.isFinite(Number(summaryActiveVoiceMeetings));
  const enabled = enabledProp && isAuthenticated && !hasSummaryField;

  return useQuery({
    queryKey: queryKeys.dashboard.meetingsActive(),
    queryFn: fetchActiveMeetingsCount,
    staleTime: STALE_TIME_DASHBOARD_MS,
    enabled,
  });
}
