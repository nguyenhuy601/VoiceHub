import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import meetingAPI from '../services/api/meetingAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { unwrapMeetingsPayload } from '../utils/adminVoiceUtils';

export function useAdminMeetings(orgId, { status, mine } = {}) {
  const { t } = useAppStrings();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMeetings = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const filters = { organizationId: orgId, limit: 100 };
      if (status) filters.status = status;
      if (mine) filters.mine = 1;
      const res = await meetingAPI.getMeetings(filters);
      setMeetings(unwrapMeetingsPayload(res));
    } catch (err) {
      const msg = resolveApiErrorMessage(err, { t, fallback: t('adminVoice.loadMeetingsFail') });
      setError(msg);
      toast.error(msg);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, status, mine, t]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  return { meetings, loading, error, loadMeetings };
}

export default useAdminMeetings;
