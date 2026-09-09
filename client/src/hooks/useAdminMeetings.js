import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import meetingAPI from '../services/api/meetingAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { unwrapMeetingsPayload } from '../utils/adminVoiceUtils';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_ADMIN_MEETINGS_MS } from '../lib/queryClient';

export function useAdminMeetings(orgId, { status, mine } = {}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const statusKey = status ? String(status) : 'all';
  const mineKey = mine ? '1' : '0';
  const toastedRef = useRef('');

  const query = useQuery({
    queryKey: [...queryKeys.admin.meetings(id, statusKey), mineKey],
    queryFn: async () => {
      try {
        const filters = { organizationId: id, limit: 100 };
        if (status) filters.status = status;
        if (mine) filters.mine = 1;
        const res = await meetingAPI.getMeetings(filters);
        return unwrapMeetingsPayload(res);
      } catch (error) {
        const msg = resolveApiErrorMessage(error, { t, fallback: t('adminVoice.loadMeetingsFail') });
        const toastKey = `${id}:${statusKey}:${mineKey}:${msg}`;
        if (toastedRef.current !== toastKey) {
          toastedRef.current = toastKey;
          toast.error(msg);
        }
        throw error;
      }
    },
    enabled: Boolean(id),
    staleTime: STALE_TIME_ADMIN_MEETINGS_MS,
  });

  const meetings = id && Array.isArray(query.data) ? query.data : [];
  const loading = Boolean(id) && query.isPending;
  const error =
    id && query.isError
      ? resolveApiErrorMessage(query.error, { t, fallback: t('adminVoice.loadMeetingsFail') })
      : '';

  const loadMeetings = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.admin.meetings(id, statusKey),
    });
  }, [id, statusKey, queryClient]);

  return { meetings, loading, error, loadMeetings };
}

export default useAdminMeetings;
