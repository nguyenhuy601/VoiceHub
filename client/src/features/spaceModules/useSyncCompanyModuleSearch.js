import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSpace, SPACE_KIND } from '../../context/SpaceContext';
import { buildCompanyModuleSearch } from '../../utils/companySpaceLevel';

/**
 * Keep URL query aligned with SpaceContext for OrganizationsPage hydrate.
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
    const desiredKey = desired.toString();
    const syncKey = `${module}|${desiredKey}`;
    if (lastSyncedRef.current === syncKey) {
      // Still apply if URL drifted away from desired
      let drifted = false;
      for (const key of ['organizationId', 'departmentId', 'teamId', 'tab']) {
        const want = desired.get(key) || '';
        const have = String(searchParams.get(key) || '').trim();
        if (want !== have) {
          drifted = true;
          break;
        }
      }
      if (!drifted) return;
    }

    let changed = false;
    const next = new URLSearchParams(searchParams);
    for (const key of ['organizationId', 'departmentId', 'teamId', 'tab']) {
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
