import { useState } from 'react';
import ChannelMessageToolbar from '../../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../../components/Organization/ChannelMessageMoreMenu';
import OrgMessageInlineEditor from '../../../components/Organization/OrgMessageInlineEditor';
import ActivityMessageCard from '../../../components/Chat/ActivityMessageCard';
import { shouldPlaceToolbarBelowBubble } from '../../../utils/messageToolbarPlacement';
import {
  canEditOrgMessage,
  canShowCopyTextInMenu,
  plainTextForMessage,
  senderIdFromMessage,
} from '../../../utils/orgChatMessageUtils';

/**
 * Một dòng tin nhắn project chat — bubble + hover toolbar + menu ngữ cảnh.
 */
export default function ProjectChannelMessageRow({
  message,
  messages = [],
  currentUser,
  currentUserId = '',
  isDarkMode = true,
  t,
  sending = false,
  editingMessageId = null,
  editDraft = '',
  savingEdit = false,
  onOpenRef,
  onQuickReact,
  onReply,
  onForward,
  onBeginEdit,
  onEditDraftChange,
  onSubmitEdit,
  onCancelEdit,
  onDelete,
  onRecall,
}) {
  const mid = String(message?._id || message?.id || '');
  const isMine = Boolean(currentUserId && senderIdFromMessage(message) === currentUserId);
  const type = String(message?.messageType || 'text');
  const isEditing = editingMessageId && String(editingMessageId) === mid;
  const showToolbar = !isEditing && !sending && type !== 'system' && !message?.isDeleted;

  const [toolbarPlace, setToolbarPlace] = useState('above');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null });

  const replyId = message?.replyToMessageId;
  const parentMsg = replyId
    ? messages.find((m) => String(m._id || m.id) === String(replyId))
    : null;
  const replyPreview = parentMsg
    ? plainTextForMessage(parentMsg, t('orgPanel.attachment')).slice(0, 160)
    : t('orgPanel.threadRoot');

  const handleMouseEnter = (event) => {
    const el = event?.currentTarget;
    if (!el) return;
    setToolbarPlace(shouldPlaceToolbarBelowBubble(el) ? 'below' : 'above');
  };

  const attachmentLabel = t('orgPanel.attachment');

  return (
    <>
      <div
        className={`group/msg relative -mx-2 rounded-lg px-2 py-0.5 transition-colors ${
          isDarkMode ? 'hover:bg-white/[0.035]' : 'hover:bg-slate-100/90'
        }`}
        onMouseEnter={handleMouseEnter}
      >
        {showToolbar && (
          <div
            className={`pointer-events-none absolute right-2 z-30 opacity-0 transition-opacity duration-150 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 ${
              toolbarPlace === 'below' ? 'top-full mt-1' : '-top-1 -translate-y-full'
            }`}
          >
            <ChannelMessageToolbar
              compact
              isMine={isMine}
              showEdit={isMine && canEditOrgMessage(message)}
              disabled={sending}
              recentReactionsStorageKey="vh_project_recent_reactions"
              onQuickReact={(emoji) => onQuickReact?.(message, emoji)}
              onMiddleAction={() => {
                if (isMine && canEditOrgMessage(message)) {
                  onBeginEdit?.(message);
                } else {
                  onReply?.(message);
                }
              }}
              onForward={() => onForward?.(message)}
              onMore={(e) => {
                const r = e?.currentTarget?.getBoundingClientRect?.();
                if (r) setMoreMenu({ open: true, anchorRect: r });
              }}
            />
          </div>
        )}

        {replyId ? (
          <div
            className={`mb-1 max-w-[80%] truncate rounded-lg border-l-2 px-2 py-1 text-[11px] ${
              isDarkMode
                ? 'border-indigo-400/50 bg-white/[0.04] text-slate-400'
                : 'border-indigo-300 bg-slate-50 text-slate-500'
            } ${isMine ? 'ml-auto' : ''}`}
          >
            {replyPreview}
          </div>
        ) : null}

        {isEditing ? (
          <OrgMessageInlineEditor
            value={editDraft}
            onChange={onEditDraftChange}
            onSave={onSubmitEdit}
            onCancel={onCancelEdit}
            isDarkMode={isDarkMode}
            saving={savingEdit}
          />
        ) : (
          <ActivityMessageCard
            message={message}
            isMine={isMine}
            currentUser={currentUser}
            t={t}
            isDarkMode={isDarkMode}
            onOpenRef={onOpenRef}
            attachmentLabel={attachmentLabel}
          />
        )}

        {Array.isArray(message?.reactions) && message.reactions.length > 0 ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {message.reactions.map((r, idx) => (
              <button
                key={`${r.emoji}-${idx}`}
                type="button"
                title={String(r.emoji || '')}
                onClick={() => onQuickReact?.(message, r.emoji)}
                className={`rounded-full border px-1.5 py-0.5 text-xs ${
                  isDarkMode
                    ? 'border-white/10 bg-white/[0.06] hover:bg-white/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ChannelMessageMoreMenu
        open={moreMenu.open}
        anchorRect={moreMenu.anchorRect}
        onClose={() => setMoreMenu({ open: false, anchorRect: null })}
        isMine={isMine}
        canCopy={canShowCopyTextInMenu(message)}
        onCopyText={() => {
          const text = plainTextForMessage(message, attachmentLabel);
          if (text) navigator.clipboard.writeText(text);
        }}
        onReply={() => onReply?.(message)}
        onForward={() => onForward?.(message)}
        onEdit={
          isMine && canEditOrgMessage(message) ? () => onBeginEdit?.(message) : undefined
        }
        onRecall={isMine ? () => onRecall?.(mid) : undefined}
        onDelete={() => onDelete?.(mid)}
      />
    </>
  );
}
