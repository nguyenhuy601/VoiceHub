/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../services/api/organizationAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { flattenOrgStructure, unwrapOrgApi } from '../utils/adminOrgStructureUtils';

export function useAdminOrgStructure(orgId) {
  const { t } = useAppStrings();
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStructure = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getStructure(orgId);
      setStructure(unwrapOrgApi(res) || null);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
      setStructure(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  const flat = useMemo(() => flattenOrgStructure(structure), [structure]);

  return {
    structure,
    loading,
    loadStructure,
    branches: flat.branches,
    divisions: flat.divisions,
    departments: flat.departments,
    teams: flat.teams,
  };
}

export default useAdminOrgStructure;
