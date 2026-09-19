import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSpace, SPACE_KIND } from '../../context/SpaceContext';
import { buildCompanyModuleSearch } from '../../utils/companySpaceLevel';

const SYNC_KEYS = ['departmentId', 'teamId', 'tab'];

/**
 * Keep URL query aligned with SpaceContext for OrganizationsPage hydrate.
 * organizationId is resolved from WorkspaceContext (not written to URL).
 * @param {'chat'|'documents'|'calendar'} module
 */
export function useSyncCompanyModuleSearch(module) {
  const space = useSpace();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastSyncedRef = useRef('');

  useEffect(() => {
    if (space?.kind !== SPACE_KIND.COMPANY) return;
    const deptId = String(space?.departmentId || '').trim();
    if (!deptId) return;

    const desired = buildCompanyModuleSearch(space, module);
    desired.delete('organizationId');
    desired.delete('orgId');
    const desiredKey = desired.toString();
    const syncKey = `${module}|${desiredKey}`;
    const hasOrgQuery = Boolean(searchParams.get('organizationId') || searchParams.get('orgId'));

    if (lastSyncedRef.current === syncKey && !hasOrgQuery) {
      let drifted = false;
      for (const key of SYNC_KEYS) {
        const want = desired.get(key) || '';
        const have = String(searchParams.get(key) || '').trim();
        if (want !== have) {
          drifted = true;
          break;
        }
      }
      if (!drifted) return;
    }

    let changed = hasOrgQuery;
    const next = new URLSearchParams(searchParams);
    next.delete('organizationId');
    next.delete('orgId');
    for (const key of SYNC_KEYS) {
      const want = desired.get(key) || '';
      const have = String(next.get(key) || '').trim();
      if (want !== have) {
        if (want) next.set(key, want);
        else next.delete(key);
        changed = true;
      }
    }
    if (!changed) {
      lastSyncedRef.current = syncKey;
      return;
    }
    lastSyncedRef.current = syncKey;
    setSearchParams(next, { replace: true });
  }, [
    space?.kind,
    space?.organizationId,
    space?.departmentId,
    space?.teamId,
    space?.level,
    module,
    searchParams,
    setSearchParams,
  ]);
}
