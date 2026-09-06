import { useEffect, useState } from 'react';
import { MoreHorizontal, Reply, Sparkles } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';

const EMOJI_QUICK = ['👍', '❤️', '😂', '🎉', '🚀', '✅', '🔥', '👀'];

/**
 * Thanh hover emoji / reply / AI / menu — UI only (Figma WorkspaceSlugPage).
 */
export default function OrgMessageHoverActions({
  visible = false,
  className = '',
  onEmojiPick,
  onReply,
  onAiExtract,
  onMenu,
  /** Parent giữ toolbar khi panel emoji mở (tránh mất hover → click chết). */
  onEmojiMenuOpenChange,
}) {
  const { t } = useAppStrings();
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    if (!visible && emojiOpen) {
      setEmojiOpen(false);
      onEmojiMenuOpenChange?.(false);
    }
  }, [visible, emojiOpen, onEmojiMenuOpenChange]);

  if (!visible) return null;

  const setOpen = (next) => {
    setEmojiOpen(next);
    onEmojiMenuOpenChange?.(next);
  };

  const pickEmoji = (emoji) => {
    onEmojiPick?.(emoji);
    setOpen(false);
  };

  return (
    <div
      className={`absolute right-2 top-0 z-30 flex -translate-y-1/2 items-center gap-0.5 rounded-[10px] border border-border bg-surface px-1 py-0.5 shadow-lg ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <button
          type="button"
          title={t('chat.addReaction')}
          aria-expanded={emojiOpen}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!emojiOpen);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition ${
            emojiOpen ? 'bg-muted' : 'hover:bg-muted'
          }`}
        >
          😊
        </button>
        {emojiOpen ? (
          <div
            className="absolute left-0 top-full z-40 mt-1 flex gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
            role="listbox"
            aria-label={t('chat.addReaction')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {EMOJI_QUICK.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="option"
                title={emoji}
                aria-label={emoji}
                onMouseDown={(e) => {
                  // mousedown trước khi unmount vì mất hover — tránh mất click
                  e.preventDefault();
                  e.stopPropagation();
                  pickEmoji(emoji);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-base transition hover:scale-125 hover:bg-muted"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        title={t('chat.replyMessage')}
        onClick={(e) => {
          e.stopPropagation();
          onReply?.();
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Reply size={13} />
      </button>

      {typeof onAiExtract === 'function' ? (
        <button
          type="button"
          title={t('chat.aiExtractTask')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAiExtract();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-ai-subtle text-ai transition hover:bg-ai-muted"
        >
          <Sparkles size={13} />
        </button>
      ) : null}

      <button
        type="button"
        title={t('chat.moreOptions')}
        onClick={(e) => {
          e.stopPropagation();
          onMenu?.(e);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal size={13} />
      </button>
    </div>
  );
}
