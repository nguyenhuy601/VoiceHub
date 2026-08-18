import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../services/api/organizationAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { flattenStructureChannels, voiceChannelsOnly } from '../utils/adminVoiceUtils';

export function useAdminVoiceRooms(orgId) {
  const { t } = useAppStrings();
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRooms = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await organizationAPI.getStructure(orgId);
      const body = res?.data?.data ?? res?.data ?? res;
      setStructure(body);
    } catch (err) {
      const msg = resolveApiErrorMessage(err, { t, fallback: t('adminVoice.loadRoomsFail') });
      setError(msg);
      toast.error(msg);
      setStructure(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const voiceRooms = useMemo(
    () => voiceChannelsOnly(flattenStructureChannels(structure)),
    [structure]
  );

  return { structure, voiceRooms, loading, error, loadRooms };
}

export default useAdminVoiceRooms;
