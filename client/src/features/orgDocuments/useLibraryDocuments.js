import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORGS_MS } from '../../lib/queryClient';
import api from '../../services/api';
import { getResolvedBearerToken } from '../../utils/tokenStorage';
import { useAppStrings } from '../../locales/appStrings';
import { mapLibraryDocumentToOrgFile, unwrapApiPayload } from './orgDocumentUtils';

async function fetchLibraryDocuments({ organizationId, projectId }) {
  const params = { limit: 100 };
  if (organizationId) params.organizationId = organizationId;
  if (projectId) params.projectId = projectId;
  const response = await api.get('/documents', { params });
  const body = unwrapApiPayload(response?.data ?? response);
  const inner = body?.data ?? body;
  if (Array.isArray(inner?.documents)) return inner.documents;
  if (Array.isArray(inner)) return inner;
  return [];
}

/** GET /documents — library org / personal / project (projectId additive D4). */
export function useLibraryDocuments({
  organizationId = '',
  projectId = '',
  enabled: enabledProp = true,
} = {}) {
  const { t, locale } = useAppStrings();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  const authReady = Boolean(getResolvedBearerToken());

  const query = useQuery({
    queryKey: [...queryKeys.org.libraryDocuments(orgId, pid), authReady ? 'auth' : 'anon'],
    queryFn: () => fetchLibraryDocuments({ organizationId: orgId, projectId: pid }),
    enabled: enabledProp && !authLoading && isAuthenticated && authReady,
    staleTime: STALE_TIME_ORGS_MS,
    retry: (failureCount, error) => {
      const status = error?.response?.status ?? error?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });

  const files = (query.data || []).map((doc) => mapLibraryDocumentToOrgFile(doc, t, locale));

  return {
    ...query,
    files,
    reload: query.refetch,
  };
}
