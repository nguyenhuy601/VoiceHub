import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Forward, MoreHorizontal, Pencil, Reply, SmilePlus } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import HoverTooltip from '../Shared/HoverTooltip';
import { shellNavRailBackdrop } from '../../theme/shellTheme';
import {
  EST_EMOJI_PANEL_PX,
  GAP_PX,
  ensureMessageToolbarRoom,
  shouldPlaceEmojiPanelBelow,
} from '../../utils/messageToolbarPlacement';

const DEFAULT_STORAGE_KEY = 'vh_org_recent_reactions';
const DEFAULT_RECENT = ['👍', '❤️', '😂'];
const QUICK_PICK = ['😀', '😂', '❤️', '👍', '🔥', '✨', '🎉', '🙏', '👀', '💀'];
const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';

function loadRecent(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...DEFAULT_RECENT];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_RECENT];
    const emojis = parsed.filter((e) => typeof e === 'string' && e.length <= 8).slice(0, 3);
    return emojis.length ? emojis : [...DEFAULT_RECENT];
  } catch {
    return [...DEFAULT_RECENT];
  }
}

function saveRecent(storageKey, list) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 3)));
  } catch {
    /* ignore */
  }
}

/**
 * Thanh công cụ khi hover tin nhắn kênh (Discord-like).
 */
export default function ChannelMessageToolbar({
  isMine: _isMine,
  showEdit,
  onQuickReact,
  onOpenEmojiPicker,
  onMiddleAction,
  onForward,
  onMore,
  disabled = false,
  compact = false,
  recentReactionsStorageKey = DEFAULT_STORAGE_KEY,
}) {
  const { t } = useAppStrings();
  const location = useLocation();
  const [recent, setRecent] = useState(() => loadRecent(recentReactionsStorageKey));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiBelow, setEmojiBelow] = useState(false);
  const toolbarRef = useRef(null);

  useEffect(() => {
    setRecent(loadRecent(recentReactionsStorageKey));
  }, [recentReactionsStorageKey]);

  useEffect(() => {
    setEmojiOpen(false);
  }, [location.pathname]);

  useEffect(
    () => () => {
      setEmojiOpen(false);
    },
    []
  );

  useEffect(() => {
    if (!emojiOpen || !toolbarRef.current) return;
    const placeBelow = shouldPlaceEmojiPanelBelow(toolbarRef.current);
    setEmojiBelow(placeBelow);
    ensureMessageToolbarRoom(toolbarRef.current, {
      needPx: EST_EMOJI_PANEL_PX + GAP_PX,
      place: placeBelow ? 'below' : 'above',
    });
  }, [emojiOpen]);

  const pushRecent = useCallback(
    (emoji) => {
      setRecent((prev) => {
        const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 3);
        saveRecent(recentReactionsStorageKey, next);
        return next;
      });
    },
    [recentReactionsStorageKey]
  );

  const recentSlots = useMemo(() => {
    const r = [...recent];
    while (r.length < 3) r.push(DEFAULT_RECENT[r.length % DEFAULT_RECENT.length]);
    return r.slice(0, 3);
  }, [recent]);

  const iconSz = compact ? 'h-7 w-7' : 'h-8 w-8';
  const emojiSz = compact ? 'text-base' : 'text-lg';
  const bar = `pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-card shadow-md ${
    compact ? 'px-1 py-0.5' : 'rounded-full px-1.5 py-1'
  }`;
  const sep = 'border-r border-border';
  const iconBtn = `flex ${iconSz} items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 ${MOTION_BTN}`;
  const emojiPanel = `absolute z-[70] grid max-h-48 w-44 grid-cols-5 gap-1 rounded-xl border border-border bg-popover p-2 shadow-xl ${
    emojiBelow ? 'left-0 top-full mt-1' : 'bottom-full right-0 mb-1'
  }`;
  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div ref={toolbarRef} className={bar} onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-0.5 ${compact ? 'pr-1' : 'pr-1.5'} ${sep}`}>
        {recentSlots.map((em) => (
          <HoverTooltip key={em} label={em} placement="top" disabled={disabled}>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('chat.toolbar.reactWith', { emoji: em })}
              onClick={() => {
                pushRecent(em);
                onQuickReact?.(em);
              }}
              className={`flex ${iconSz} items-center justify-center rounded-md ${emojiSz} hover:bg-muted disabled:opacity-40 ${MOTION_BTN}`}
            >
              <span aria-hidden>{em}</span>
            </button>
          </HoverTooltip>
        ))}
      </div>

      <div className={`relative flex items-center gap-0.5 ${compact ? 'pl-0' : 'pl-0.5'}`}>
        <HoverTooltip label={t('chat.addReaction')} placement="top" disabled={disabled}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEmojiOpen((v) => !v)}
            className={iconBtn}
            aria-label={t('chat.addReaction')}
            aria-expanded={emojiOpen}
          >
            <SmilePlus className={iconClass} strokeWidth={2} aria-hidden />
          </button>
        </HoverTooltip>
        {emojiOpen && (
          <>
            <button
              type="button"
              aria-label={t('nav.close')}
              className={`${shellNavRailBackdrop} z-[60] cursor-default bg-transparent`}
              onClick={() => setEmojiOpen(false)}
            />
            <div
              className={emojiPanel}
              role="listbox"
              aria-label={t('chat.toolbar.emojiPicker')}
            >
              {QUICK_PICK.map((em) => (
                <button
                  key={em}
                  type="button"
                  role="option"
                  aria-label={t('chat.toolbar.reactWith', { emoji: em })}
                  className={`flex h-9 items-center justify-center rounded-lg text-lg hover:bg-muted ${MOTION_BTN}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pushRecent(em);
                    onQuickReact?.(em);
                    onOpenEmojiPicker?.(em);
                    setEmojiOpen(false);
                  }}
                >
                  <span aria-hidden>{em}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <HoverTooltip
          label={showEdit ? t('chat.editMessage') : t('chat.replyMessage')}
          placement="top"
          disabled={disabled}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMiddleAction?.()}
            className={iconBtn}
            aria-label={showEdit ? t('chat.editMessage') : t('chat.replyMessage')}
          >
            {showEdit ? (
              <Pencil className={iconClass} strokeWidth={2} aria-hidden />
            ) : (
              <Reply className={iconClass} strokeWidth={2} aria-hidden />
            )}
          </button>
        </HoverTooltip>

        <HoverTooltip label={t('chat.forwardMessage')} placement="top" disabled={disabled}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onForward?.()}
            className={iconBtn}
            aria-label={t('chat.forwardMessage')}
          >
            <Forward className={iconClass} strokeWidth={2} aria-hidden />
          </button>
        </HoverTooltip>

        <HoverTooltip label={t('chat.moreItems')} placement="top" disabled={disabled}>
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => onMore?.(e)}
            className={iconBtn}
            aria-label={t('chat.moreItems')}
          >
            <MoreHorizontal className={iconClass} strokeWidth={2} aria-hidden />
          </button>
        </HoverTooltip>
      </div>
    </div>
  );
}
