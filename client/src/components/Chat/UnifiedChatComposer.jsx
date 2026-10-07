import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Bold,
  Code,
  Gift,
  Italic,
  LayoutGrid,
  Link2,
  Smile,
  Sparkles,
  Sticker,
} from 'lucide-react';
import HoverTooltip from '../Shared/HoverTooltip';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import { CHAT_MESSAGE_MAX_LENGTH, resolveMentionNavIndex } from '../../utils/chatComposerLimits';

const MOTION_CHIP =
  'motion-safe:transition-colors motion-reduce:transition-none';
const MOTION_SEND =
  'motion-safe:transition-[background-color,box-shadow,filter] motion-reduce:transition-none';

function UnifiedChatComposer({
  value = '',
  onChange,
  onSend,
  placeholder,
  disabled = false,
  sendDisabled = false,
  sendLabel,
  plusItems = [],
  onOpenGift,
  onOpenGif,
  onOpenSticker,
  onOpenEmoji,
  onOpenApps,
  actionItems,
  /** Tuỳ chỉnh lớp vỏ ngoài (ví dụ nền khớp trang chat bạn bè) */
  wrapperClassName,
  /** Ví dụ: thanh “Đang phản hồi …” phía trên ô nhập */
  topSlot = null,
  /** Thanh định dạng phía trên ô nhập (chat 1-1 kiểu Discord/Teams) */
  richToolbar = false,
  onRichAction,
  /** Nút AI trợ lý (chỉ UI; bật/tắt tùy parent) */
  showAiToggle = false,
  aiEnabled = false,
  onAiToggle,
  /** Hiện nút Gửi (Enter vẫn gửi được khi tắt) */
  showSendButton = true,
  /** Ô nhập phẳng, không viền/nền bọc trong */
  flatInner = false,
  /** Các nút icon nằm bên trái ô nhập, dùng cho composer Figma DM. */
  leadingItems = [],
  rowClassName,
  /** Một dòng (input text) thay vì textarea */
  singleLine = false,
  mentionItems = [],
  onPaste,
  /** @deprecated Theme tokens tự thích ứng; giữ prop để tương thích caller cũ. */
  forceLight: _forceLight = false,
}) {
  const MAX_TEXTAREA_HEIGHT = 240;
  const { t } = useAppStrings();
  const mentionListId = useId();
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const plusButtonRef = useRef(null);
  const plusMenuRef = useRef(null);
  const mentionButtonRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const safePlusItems = useMemo(
    () => (Array.isArray(plusItems) ? plusItems.filter((item) => item && item.label) : []),
    [plusItems]
  );
  const safeMentionItems = useMemo(
    () => (Array.isArray(mentionItems) ? mentionItems.filter((item) => item && item.label) : []),
    [mentionItems]
  );
  const safeLeadingItems = useMemo(
    () => (Array.isArray(leadingItems) ? leadingItems.filter((item) => item && item.key) : []),
    [leadingItems]
  );
  const filteredMentionItems = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return safeMentionItems;
    return safeMentionItems.filter((item) => {
      const label = String(item.label || '').toLowerCase();
      const username = String(item.username || '').toLowerCase();
      return label.includes(q) || username.includes(q);
    });
  }, [safeMentionItems, mentionQuery]);

  const activeMentionIndex = useMemo(() => {
    if (!filteredMentionItems.length) return -1;
    return Math.min(Math.max(mentionActiveIndex, 0), filteredMentionItems.length - 1);
  }, [filteredMentionItems.length, mentionActiveIndex]);

  useEffect(() => {
    if (!showMentionMenu) return;
    setMentionActiveIndex(0);
  }, [mentionQuery, showMentionMenu]);

  const resolvedPlaceholder = placeholder ?? t('chat.placeholderInput');
  const resolvedSendLabel = sendLabel ?? t('chat.composer.send');
  const inputAriaLabel = t('chat.composer.ariaInput');
  const resolvedActionItems = useMemo(() => {
    if (Array.isArray(actionItems)) {
      return actionItems.filter((item) => item && item.key);
    }
    return [
      {
        key: 'gift',
        title: t('chat.actionGift'),
        content: <Gift className="h-4 w-4" strokeWidth={2} aria-hidden />,
        onClick: onOpenGift,
      },
      {
        key: 'gif',
        title: t('chat.actionGif'),
        content: 'GIF',
        onClick: onOpenGif,
        className: 'px-1 text-[11px] font-bold min-w-8',
      },
      {
        key: 'sticker',
        title: t('chat.actionSticker'),
        content: <Sticker className="h-4 w-4" strokeWidth={2} aria-hidden />,
        onClick: onOpenSticker,
      },
      {
        key: 'emoji',
        title: t('chat.composer.emoji'),
        content: <Smile className="h-4 w-4" strokeWidth={2} aria-hidden />,
        onClick: onOpenEmoji,
      },
      {
        key: 'apps',
        title: t('chat.actionApps'),
        content: <LayoutGrid className="h-4 w-4" strokeWidth={2} aria-hidden />,
        onClick: onOpenApps,
      },
    ];
  }, [actionItems, onOpenGift, onOpenGif, onOpenSticker, onOpenEmoji, onOpenApps, t]);

  useEffect(() => {
    if (!showPlusMenu && !showMentionMenu) return undefined;

    const handleOutsideClick = (event) => {
      const clickedPlusMenu = plusMenuRef.current?.contains(event.target);
      const clickedPlusButton = plusButtonRef.current?.contains(event.target);
      const clickedMentionMenu = mentionMenuRef.current?.contains(event.target);
      const clickedMentionButton = mentionButtonRef.current?.contains(event.target);
      if (clickedPlusMenu || clickedPlusButton || clickedMentionMenu || clickedMentionButton) return;
      setShowPlusMenu(false);
      setShowMentionMenu(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showPlusMenu, showMentionMenu]);

  useEffect(() => {
    if (singleLine) return;
    const el = inputRef.current;
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, [value, singleLine]);

  const handleSend = () => {
    if (disabled || sendDisabled) return;
    onSend?.();
  };

  const syncSelection = () => {
    const el = inputRef.current;
    if (!el || typeof el.selectionStart !== 'number') return;
    selectionRef.current = {
      start: el.selectionStart,
      end: el.selectionEnd ?? el.selectionStart,
    };
  };

  const insertWrap = (before, after = before, selectRange) => {
    if (disabled) return;
    const el = inputRef.current;
    const cur = value ?? '';
    const saved = selectionRef.current;
    const start =
      el && typeof el.selectionStart === 'number' ? el.selectionStart : saved.start;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd ?? start : saved.end;
    const sel = cur.slice(start, end);
    const next = `${cur.slice(0, start)}${before}${sel}${after}${cur.slice(end)}`;
    onChange?.(next);
    requestAnimationFrame(() => {
      try {
        el?.focus();
        if (!el) return;
        if (typeof selectRange === 'function') {
          const range = selectRange({ start, end, sel, before, after, next });
          if (range) {
            el.setSelectionRange(range.start, range.end);
            return;
          }
        }
        const pos = start + before.length + sel.length + after.length;
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  };

  const insertMention = (label) => {
    if (disabled) return;
    const el = inputRef.current;
    const cur = value ?? '';
    if (el && typeof el.selectionStart === 'number') {
      const cursor = el.selectionStart;
      const head = cur.slice(0, cursor);
      const tail = cur.slice(cursor);
      const match = head.match(/(^|\s)@([^\s@]*)$/);
      if (match) {
        const token = match[0];
        const prefix = head.slice(0, head.length - token.length);
        const spacer = token.startsWith(' ') ? ' ' : '';
        const next = `${prefix}${spacer}@${label} ${tail}`;
        onChange?.(next);
      } else {
        const next = `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}@${label} `;
        onChange?.(next);
      }
    } else {
      const next = `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}@${label} `;
      onChange?.(next);
    }
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionActiveIndex(0);
    requestAnimationFrame(() => {
      try {
        inputRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
  };

  const mentionOptionId = (index) => `${mentionListId}-opt-${index}`;

  const fmt = (kind) => {
    onRichAction?.(kind);
    if (kind === 'bold') insertWrap('**', '**');
    else if (kind === 'italic') insertWrap('*', '*');
    else if (kind === 'code') insertWrap('`', '`');
    else if (kind === 'mention') {
      if (safeMentionItems.length > 0) {
        setShowPlusMenu(false);
        setMentionQuery('');
        setShowMentionMenu((prev) => !prev);
      } else {
        insertWrap('@');
      }
    } else if (kind === 'link') {
      insertWrap('[', '](url)', ({ start, sel, before }) => {
        const urlStart = start + before.length + sel.length + 2;
        return { start: urlStart, end: urlStart + 3 };
      });
    }
  };

  const defaultWrapper = 'shrink-0 border-t border-border bg-surface/60 p-3.5';
  const richToolbarDivider = 'border-b border-border';
  const fmtBtn = `rounded-md p-2 text-muted-foreground ${MOTION_CHIP} hover:bg-muted hover:text-foreground disabled:opacity-40`;
  const composerInner = flatInner
    ? 'relative flex flex-col gap-1.5'
    : 'relative flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-2.5 py-2 shadow-inner';
  const plusBtnClass = `h-9 w-9 shrink-0 rounded-lg text-2xl leading-none text-foreground ${MOTION_CHIP} hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50`;
  const plusMenuClass =
    'absolute bottom-[52px] left-0 z-30 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl';
  const plusMenuRow = `flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground ${MOTION_CHIP} hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40`;
  const textareaClass = (() => {
    const base =
      'scrollbar-composer max-h-[240px] min-w-0 flex-1 resize-none overflow-y-auto overflow-x-hidden bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60';
    if (flatInner) {
      return `${base} min-h-9 px-2 py-2 leading-5`;
    }
    if (richToolbar) {
      return `${base} min-h-[36px] px-2 py-1.5 leading-normal`;
    }
    return `${base} min-h-[44px] px-2 py-2 leading-relaxed`;
  })();
  const inputClass =
    'h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60';

  const handleInputChange = (nextRaw) => {
    const nextValue = singleLine ? String(nextRaw).replace(/[\r\n]+/g, ' ') : nextRaw;
    onChange?.(nextValue);
    if (!safeMentionItems.length) return;
    const el = inputRef.current;
    const cursor =
      el && typeof el.selectionStart === 'number' ? el.selectionStart : nextValue.length;
    const head = nextValue.slice(0, cursor);
    const match = head.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowPlusMenu(false);
      setShowMentionMenu(true);
    } else if (showMentionMenu) {
      setShowMentionMenu(false);
      setMentionQuery('');
    }
  };

  const handleInputKeyDown = (event) => {
    if (showMentionMenu && filteredMentionItems.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setMentionActiveIndex((prev) =>
          resolveMentionNavIndex(prev, event.key, filteredMentionItems.length)
        );
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const pick = filteredMentionItems[activeMentionIndex] || filteredMentionItems[0];
        if (pick) insertMention(pick.label);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMentionMenu(false);
        setMentionQuery('');
        return;
      }
    }
    if (event.key === 'Enter' && (!singleLine ? !event.shiftKey : true)) {
      event.preventDefault();
      handleSend();
    }
  };

  const actionBtn = `inline-flex h-9 items-center justify-center rounded-lg text-muted-foreground ${MOTION_CHIP} hover:bg-muted hover:text-foreground disabled:opacity-50`;
  const flatActionBtn = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground ${MOTION_CHIP} hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50`;

  const renderIconControl = (item, { flat = false } = {}) => {
    const label = item.title || item.label || item.key;
    const btnClass = flat
      ? `${flatActionBtn} ${item.className || ''}`.trim()
      : `${actionBtn} ${item.className || 'w-9 text-base'}`.trim();
    return (
      <HoverTooltip key={item.key} label={label} placement="top" disabled={disabled || item.disabled}>
        <button
          type="button"
          disabled={disabled || item.disabled}
          onClick={item.onClick}
          className={btnClass}
          aria-label={label}
        >
          {item.content}
        </button>
      </HoverTooltip>
    );
  };

  const isMentionMenuOpen = showMentionMenu && safeMentionItems.length > 0;
  const inputA11yProps = {
    'aria-label': inputAriaLabel,
    maxLength: CHAT_MESSAGE_MAX_LENGTH,
    role: safeMentionItems.length ? 'combobox' : undefined,
    'aria-autocomplete': safeMentionItems.length ? 'list' : undefined,
    'aria-expanded': safeMentionItems.length ? isMentionMenuOpen : undefined,
    'aria-controls': isMentionMenuOpen ? mentionListId : undefined,
    'aria-activedescendant':
      isMentionMenuOpen && activeMentionIndex >= 0
        ? mentionOptionId(activeMentionIndex)
        : undefined,
  };

  return (
    <div className={wrapperClassName ?? defaultWrapper}>
      {topSlot}
      {richToolbar && (
        <div className={`mb-2 flex flex-wrap items-center gap-0.5 pb-2 ${richToolbarDivider}`}>
          {[
            { k: 'bold', Icon: Bold, title: t('chat.toolbarBold') },
            { k: 'italic', Icon: Italic, title: t('chat.toolbarItalic') },
            { k: 'link', Icon: Link2, title: t('chat.toolbarLink') },
            { k: 'mention', Icon: AtSign, title: t('chat.toolbarMention') },
            { k: 'code', Icon: Code, title: t('chat.toolbarCode') },
          ].map(({ k, Icon, title }) => (
            <HoverTooltip key={k} label={title} placement="top" disabled={disabled}>
              <button
                type="button"
                disabled={disabled}
                ref={k === 'mention' ? mentionButtonRef : undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  syncSelection();
                }}
                onClick={() => fmt(k)}
                className={fmtBtn}
                aria-label={title}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </HoverTooltip>
          ))}
        </div>
      )}
      <div className={composerInner}>
        {isMentionMenuOpen && (
          <div
            ref={mentionMenuRef}
            className="absolute bottom-[52px] right-0 z-30 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          >
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('chat.mentionSuggestions')}
            </div>
            <div
              id={mentionListId}
              role="listbox"
              aria-label={t('chat.mentionSuggestions')}
              className="max-h-56 overflow-y-auto"
            >
              {filteredMentionItems.length ? (
                filteredMentionItems.map((item, index) => (
                  <button
                    key={String(item.userId || item.value || item.username || item.label || index)}
                    id={mentionOptionId(index)}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeMentionIndex}
                    onMouseEnter={() => setMentionActiveIndex(index)}
                    onClick={() => insertMention(item.label)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground ${MOTION_CHIP} hover:bg-muted ${
                      index === activeMentionIndex ? 'bg-muted' : ''
                    }`}
                  >
                    <UserAvatar avatar={item.avatar} name={item.label} size="chip" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.username ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          @{item.username}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))
              ) : (
                <div role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
                  {t('chat.mentionNoMatch')}
                </div>
              )}
            </div>
          </div>
        )}
        <div
          className={
            rowClassName ??
            `flex gap-2 ${singleLine || richToolbar || flatInner ? 'items-center' : 'items-end'}`
          }
        >
          {safeLeadingItems.length > 0 ? (
            <div className={`flex shrink-0 items-center ${flatInner ? 'gap-0.5' : 'gap-1'}`}>
              {safeLeadingItems.map((item) => renderIconControl(item, { flat: flatInner }))}
            </div>
          ) : null}
          {safePlusItems.length > 0 && (
            <>
              <HoverTooltip label={t('chat.addUtilities')} placement="top" disabled={disabled}>
                <button
                  ref={plusButtonRef}
                  type="button"
                  disabled={disabled}
                  onClick={() => setShowPlusMenu((prev) => !prev)}
                  className={plusBtnClass}
                  aria-label={t('chat.addUtilities')}
                  aria-expanded={showPlusMenu}
                >
                  +
                </button>
              </HoverTooltip>

              {showPlusMenu && (
                <div ref={plusMenuRef} className={plusMenuClass}>
                  {safePlusItems.map((item) => (
                    <button
                      key={item.key || item.label}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick?.();
                        setShowPlusMenu(false);
                      }}
                      className={plusMenuRow}
                    >
                      <span className="text-base" aria-hidden>
                        {item.icon || '•'}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {singleLine ? (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={onPaste}
              disabled={disabled}
              placeholder={resolvedPlaceholder}
              className={inputClass}
              autoComplete="off"
              {...inputA11yProps}
            />
          ) : (
            <textarea
              ref={inputRef}
              value={value}
              rows={1}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={onPaste}
              disabled={disabled}
              placeholder={resolvedPlaceholder}
              className={textareaClass}
              {...inputA11yProps}
            />
          )}

          <div
            className={`flex shrink-0 ${
              showSendButton ? 'flex-col items-end gap-2' : 'items-center'
            }`}
          >
            <div className={`flex items-center ${flatInner ? 'gap-0.5' : 'gap-1'}`}>
              {resolvedActionItems.map((item) => renderIconControl(item, { flat: flatInner }))}
              {showAiToggle && (
                <HoverTooltip label={t('chat.aiSuggestBeta')} placement="top" disabled={disabled}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAiToggle?.(!aiEnabled)}
                    className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${MOTION_CHIP} ${
                      aiEnabled
                        ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    }`}
                    aria-label={t('chat.aiSuggestBeta')}
                    aria-pressed={aiEnabled}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    AI
                  </button>
                </HoverTooltip>
              )}
            </div>
            {showSendButton && (
              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || sendDisabled}
                aria-label={resolvedSendLabel}
                className={`rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm ${MOTION_SEND} hover:bg-primary-hover hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {resolvedSendLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnifiedChatComposer;
