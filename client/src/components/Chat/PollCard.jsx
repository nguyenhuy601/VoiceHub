import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const MOTION =
  'motion-safe:transition-colors motion-safe:duration-150 motion-reduce:transition-none';

/**
 * Gộp tin poll realtime: counts từ server; giữ phiếu của viewer khi broadcast không gắn viewer.
 */
export function mergePollRealtimeMessage(prev, incoming) {
  if (!incoming || typeof incoming !== 'object') return prev;
  const nextPoll = incoming.poll;
  if (!nextPoll || typeof nextPoll !== 'object') {
    return { ...(prev || {}), ...incoming };
  }
  const incomingVotes = Array.isArray(nextPoll.viewerVoteOptionIds)
    ? nextPoll.viewerVoteOptionIds
    : [];
  const kept =
    incomingVotes.length > 0
      ? incomingVotes
      : prev?.poll?.viewerVoteOptionIds || [];
  return {
    ...(prev || {}),
    ...incoming,
    poll: {
      ...(prev?.poll || {}),
      ...nextPoll,
      viewerVoteOptionIds: kept,
    },
  };
}

function unwrapMessage(payload) {
  const body = payload?.data ?? payload;
  if (body && typeof body === 'object' && body.data && body.data.poll) return body.data;
  return body;
}

export default function PollCard({ message, t, onUpdated }) {
  const poll = message?.poll;
  const [busy, setBusy] = useState(false);
  const votedKey = (poll?.viewerVoteOptionIds || []).join('|');
  const [multiPick, setMultiPick] = useState(() => new Set(poll?.viewerVoteOptionIds || []));

  useEffect(() => {
    setMultiPick(new Set(votedKey ? votedKey.split('|') : []));
  }, [votedKey]);

  if (!poll || !Array.isArray(poll.options)) {
    return (
      <p className="whitespace-pre-wrap text-sm text-foreground">{String(message?.content || '')}</p>
    );
  }

  const votedIds = new Set(poll.viewerVoteOptionIds || []);
  const closed = Boolean(poll.closed);
  const expired =
    !closed && poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now();
  const locked = closed || expired;
  const alreadySingle = !poll.allowMulti && votedIds.size > 0;
  const total = poll.options.reduce((sum, opt) => sum + (Number(opt.count) || 0), 0);
  const messageId = String(message?._id || message?.id || '');

  const submit = async (optionIds) => {
    if (!messageId || busy || locked || alreadySingle) return;
    const ids = (optionIds || []).map(String).filter(Boolean);
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await api.post(`/messages/${messageId}/votes`, { optionIds: ids });
      const next = unwrapMessage(res);
      onUpdated?.(next);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('chat.poll.vote') }));
    } finally {
      setBusy(false);
    }
  };

  const toggleMulti = (id) => {
    setMultiPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  let status = '';
  if (closed) status = t('chat.poll.closed');
  else if (expired) status = t('chat.poll.expired');
  else if (votedIds.size > 0) status = t('chat.poll.voted');
  else if (poll.allowMulti) status = t('chat.poll.multiHint');

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-3 text-left text-foreground">
      <p className="text-sm font-semibold leading-snug">{poll.question || message?.content}</p>
      {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
      <ul className="mt-3 space-y-2" aria-label={poll.question || t('chat.poll.vote')}>
        {poll.options.map((opt) => {
          const id = String(opt.id);
          const count = Number(opt.count) || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const selected = poll.allowMulti ? multiPick.has(id) : votedIds.has(id);
          const disabled = busy || locked || alreadySingle;
          const rowClass = `relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm ${MOTION} ${
            selected
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted/40'
          }`;
          const bar = (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 bg-primary/15 motion-safe:transition-[width] motion-safe:duration-300 motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          );
          const label = (
            <>
              <span className="relative min-w-0 flex-1 truncate">{opt.text}</span>
              <span className="relative shrink-0 tabular-nums text-xs text-muted-foreground">{count}</span>
            </>
          );
          return (
            <li key={id}>
              {poll.allowMulti ? (
                <label className={`${rowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
                  {bar}
                  <input
                    type="checkbox"
                    className="relative h-4 w-4 shrink-0 rounded border-border accent-primary"
                    checked={multiPick.has(id)}
                    disabled={disabled}
                    aria-label={opt.text}
                    onChange={() => toggleMulti(id)}
                  />
                  {label}
                </label>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={votedIds.has(id)}
                  onClick={() => submit([id])}
                  className={`${rowClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default enabled:hover:border-primary/40`}
                >
                  {bar}
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('chat.poll.votesCount', { n: total })}</p>
        {poll.allowMulti && !locked ? (
          <button
            type="button"
            disabled={busy || multiPick.size === 0}
            onClick={() => submit([...multiPick])}
            className={`rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 ${MOTION}`}
          >
            {t('chat.poll.vote')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
