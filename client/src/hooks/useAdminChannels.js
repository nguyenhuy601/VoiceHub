import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../services/api/organizationAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { flattenStructureChannels } from '../utils/adminVoiceUtils';
import { unwrapOrgApi } from '../utils/adminOrgStructureUtils';

export function useAdminChannels(orgId) {
  const { t } = useAppStrings();
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadChannels = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await organizationAPI.getStructure(orgId);
      setStructure(unwrapOrgApi(res) || null);
    } catch (err) {
      const msg = resolveApiErrorMessage(err, { t, fallback: t('adminChannels.loadFail') });
      setError(msg);
      toast.error(msg);
      setStructure(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const channels = useMemo(() => flattenStructureChannels(structure), [structure]);

  return { channels, loading, error, loadChannels };
}

export default useAdminChannels;
