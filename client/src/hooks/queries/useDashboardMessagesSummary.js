import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_DASHBOARD_MS } from '../../lib/queryClient';
import { parseMessageListPage } from '../../lib/parseMessageListPage';

async function fetchMessagesForDashboardPaged({ maxPages = 1, limit = 30 } = {}) {
  const rows = [];
  let pageToken;
  for (let i = 0; i < maxPages; i += 1) {
    const params = { limit, fields: 'summary' };
    if (pageToken) params.pageToken = pageToken;
    const msgRes = await api.get('/messages', { params, skipGlobalErrorHandling: true }).catch(() => null);
    if (!msgRes) break;
    const page = parseMessageListPage(msgRes);
    const batch = page.messages || [];
    if (!batch.length) break;
    rows.push(...batch);
    if (!page.hasMore || !page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return rows;
}

/** Snippet DM / heatmap Overview — cache riêng, không refetch theo badge. */
export function useDashboardMessagesSummary({
  enabled: enabledProp = true,
  userId = '',
} = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;

  return useQuery({
    queryKey: queryKeys.dashboard.messagesSummary(userId),
    queryFn: () => fetchMessagesForDashboardPaged({ maxPages: 1, limit: 30 }),
    staleTime: STALE_TIME_DASHBOARD_MS,
    enabled,
  });
}
