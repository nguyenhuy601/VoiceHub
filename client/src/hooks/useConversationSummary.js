import { useCallback, useRef, useState } from 'react';
import conversationSummaryService from '../services/conversationSummaryService';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';

const POLL_MS = 2000;
const MAX_POLLS = 90;

export function useConversationSummary({ organizationId, roomId, currentUserId, t }) {
  const [phase, setPhase] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const abortRef = useRef(false);

  const userHeaders = currentUserId ? { 'x-user-id': String(currentUserId) } : {};

  const reset = useCallback(() => {
    abortRef.current = true;
    setPhase('idle');
    setSummary(null);
    setError('');
  }, []);

  const startSummary = useCallback(
    async ({ unreadOnly = true, maxMessages = 200 } = {}) => {
      if (!organizationId || !roomId || !currentUserId) {
        setError(t?.('chat.summaryMissingContext') || 'Thiếu thông tin kênh');
        setPhase('failed');
        return;
      }

      abortRef.current = false;
      setPhase('loading');
      setError('');
      setSummary(null);

      try {
        const res = await conversationSummaryService.create(
          {
            scope: 'org_channel',
            organizationId: String(organizationId),
            roomId: String(roomId),
            options: { unreadOnly, maxMessages },
          },
          userHeaders
        );

        const payload = res?.data?.data ?? res?.data ?? res;
        if (payload?.cached && payload?.status === 'ready') {
          setSummary(payload);
          setPhase('ready');
          return;
        }

        const summaryId = payload?.summaryId;
        if (!summaryId) {
          throw new Error(res?.message || t?.('chat.summaryNoId') || 'Không nhận được summaryId');
        }

        for (let i = 0; i < MAX_POLLS; i++) {
          if (abortRef.current) return;
          const poll = await conversationSummaryService.getById(summaryId, userHeaders);
          const row = poll?.data?.data ?? poll?.data ?? poll;
          const st = row?.status;
          if (st === 'ready') {
            setSummary(row);
            setPhase('ready');
            return;
          }
          if (st === 'failed') {
            setPhase('failed');
            setError(row?.error || t?.('chat.summaryFailed') || 'Tóm tắt thất bại');
            return;
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }

        setPhase('failed');
        setError(t?.('chat.summaryTimeout') || 'Hết thời gian chờ tóm tắt');
      } catch (err) {
        setPhase('failed');
        setError(resolveApiErrorMessage(err, t?.('chat.summaryFailed') || 'Tóm tắt thất bại'));
      }
    },
    [organizationId, roomId, currentUserId, t, userHeaders]
  );

  return {
    phase,
    summary,
    error,
    startSummary,
    reset,
  };
}
