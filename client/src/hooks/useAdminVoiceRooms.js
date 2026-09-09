import { useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { flattenStructureChannels, voiceChannelsOnly } from '../utils/adminVoiceUtils';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_ORG_STRUCTURE_MS } from '../lib/queryClient';
import {
  fetchAdminOrgStructure,
  invalidateOrgStructureQueries,
} from './useAdminOrgStructure';

export function useAdminVoiceRooms(orgId) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const toastedRef = useRef('');

  const query = useQuery({
    queryKey: queryKeys.org.structure(id, false),
    queryFn: async () => {
      try {
        return await fetchAdminOrgStructure(id, false, { t, showToast: false });
      } catch (error) {
        const msg = resolveApiErrorMessage(error, { t, fallback: t('adminVoice.loadRoomsFail') });
        const toastKey = `${id}:voice:${msg}`;
        if (toastedRef.current !== toastKey) {
          toastedRef.current = toastKey;
          toast.error(msg);
        }
        throw error;
      }
    },
    enabled: Boolean(id),
    staleTime: STALE_TIME_ORG_STRUCTURE_MS,
  });

  const structure = id && query.data !== undefined ? query.data : null;
  const loading = Boolean(id) && query.isPending;
  const error =
    id && query.isError
      ? resolveApiErrorMessage(query.error, { t, fallback: t('adminVoice.loadRoomsFail') })
      : '';

  const loadRooms = useCallback(async () => {
    if (!id) return;
    await invalidateOrgStructureQueries(queryClient, id);
  }, [id, queryClient]);

  const voiceRooms = useMemo(
    () => voiceChannelsOnly(flattenStructureChannels(structure)),
    [structure]
  );

  return { structure, voiceRooms, loading, error, loadRooms };
}

export default useAdminVoiceRooms;
