import { normalizeMessageRefs, contextCallTargetFromMessage } from './chatContextRefs';
import { ChatMessageAttachmentBody } from './ChatFileAttachment';
import { resolveAttachmentUserCaption } from '../../utils/orgChatMessageUtils';
import { formatChatClockTime } from '../../utils/chatMessageTime';

function senderName(message, isMine, currentUser, fallback) {
  if (isMine) {
    return (
      currentUser?.displayName ||
      currentUser?.fullName ||
      currentUser?.username ||
      fallback
    );
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.displayName || u.username || u.fullName || fallback;
  }
  return fallback;
}

function TimePill({ label, isDarkMode, tone = 'muted' }) {
  if (!label) return null;
  const cls =
    tone === 'onPrimary'
      ? 'text-[10px] font-medium tabular-nums opacity-80'
      : isDarkMode
        ? 'inline-flex shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-300'
        : 'inline-flex shrink-0 rounded-full bg-slate-200/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600';
  return <span className={cls}>{label}</span>;
}

/**
 * Bubble tin kênh Project — text thường hoặc activity (system + refs).
 * Giờ kiểu Zalo: tin mình trong bubble; tin người khác pill bên cạnh.
 */
export default function ActivityMessageCard({
  message,
  isMine = false,
  currentUser = null,
  t,
  isDarkMode = true,
  onOpenRef,
  attachmentLabel = '',
  showClock = true,
}) {
  const refs = normalizeMessageRefs(message);
  const call = contextCallTargetFromMessage(message);
  const isActivity =
    String(message?.messageType || '') === 'system' && (refs.length > 0 || Boolean(call));
  const name = senderName(message, isMine, currentUser, t('orgPanel.member'));
  const chipCls = `mb-1 w-full rounded-lg border px-2 py-1.5 text-left text-xs ${
    isDarkMode ? 'border-indigo-400/25 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'
  }`;
  const mt = String(message?.messageType || 'text').toLowerCase();
  const hasAttachment = mt === 'file' || mt === 'image' || Boolean(message?.fileMeta);
  const attachmentCaption = resolveAttachmentUserCaption(message);
  const clock = showClock ? formatChatClockTime(message?.createdAt) : '';

  if (message?.isRecalled) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <p className="text-xs italic text-muted-foreground">{t('friendChat.recalledPlaceholder')}</p>
      </div>
    );
  }

  if (isActivity) {
    return (
      <div className="flex justify-start">
        <div
          className={`max-w-[90%] rounded-2xl border px-3 py-2.5 text-sm ${
            isDarkMode
              ? 'border-amber-400/20 bg-amber-500/10 text-slate-100'
              : 'border-amber-200 bg-amber-50 text-foreground'
          }`}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('orgPanel.activitySystemBadge')}
          </div>
          {refs.map((ref) => (
            <button
              key={`${ref.kind}-${ref.id}`}
              type="button"
              className={chipCls}
              onClick={() => onOpenRef?.(ref)}
            >
              <span className="font-mono font-semibold">{ref.label || ref.id}</span>
            </button>
          ))}
          <div className="whitespace-pre-wrap break-words opacity-95">
            {String(message?.content || '')}
          </div>
          {clock ? (
            <div className="mt-1 flex justify-end">
              <TimePill label={clock} isDarkMode={isDarkMode} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const bubble = (
    <div
      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
        isMine
          ? 'bg-primary text-primary-foreground'
          : isDarkMode
            ? 'bg-white/10 text-slate-100'
            : 'bg-muted text-foreground'
      }`}
    >
      {!isMine ? (
        <div className="mb-0.5 text-[10px] font-semibold opacity-80">{name}</div>
      ) : null}
      {call ? (
        <button type="button" className={chipCls} onClick={() => onOpenRef?.(call)}>
          {call.label || t('orgPanel.contextCallFallback')}
        </button>
      ) : null}
      {refs.map((ref) => (
        <button
          key={`${ref.kind}-${ref.id}`}
          type="button"
          className={chipCls}
          onClick={() => onOpenRef?.(ref)}
        >
          <span className="font-mono font-semibold">{ref.label || ref.id}</span>
        </button>
      ))}
      {hasAttachment ? (
        <>
          <ChatMessageAttachmentBody
            message={message}
            isDarkMode={isDarkMode}
            compact
          />
          {attachmentCaption ? (
            <div className="mt-1.5 whitespace-pre-wrap break-words text-sm">{attachmentCaption}</div>
          ) : null}
        </>
      ) : (
        <div className="whitespace-pre-wrap break-words">{String(message?.content || '')}</div>
      )}
      <div
        className={`mt-1 flex items-center gap-1.5 ${
          isMine ? 'justify-end' : 'justify-between'
        }`}
      >
        {message?.editedAt ? (
          <span className="text-[10px] opacity-70">{t('orgPanel.edited')}</span>
        ) : (
          <span />
        )}
        {isMine && clock ? (
          <TimePill label={clock} isDarkMode={isDarkMode} tone="onPrimary" />
        ) : null}
      </div>
    </div>
  );

  if (isMine) {
    return <div className="flex justify-end">{bubble}</div>;
  }

  // Tin nhận: giờ pill ngoài bubble (kiểu Zalo).
  return (
    <div className="flex items-end justify-start gap-1.5">
      {clock ? <TimePill label={clock} isDarkMode={isDarkMode} /> : null}
      {bubble}
    </div>
  );
}
