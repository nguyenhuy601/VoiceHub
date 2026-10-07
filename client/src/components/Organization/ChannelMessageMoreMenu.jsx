import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Copy, Forward, ListChecks, Pencil, Pin, Reply, Trash2, Undo2 } from 'lucide-react';
import { shellNavRailBackdrop } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';
import { handlePickerListKeyDown } from '../adminUsers/pickerListKeyboard';

const MENU_WIDTH = 256;
const EST_MENU_HEIGHT = 380;

const ITEM_CLASS =
  'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none motion-reduce:transition-none';
const DANGER_ITEM_CLASS =
  'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none motion-reduce:transition-none';
const ICON_CLASS = 'h-4 w-4 shrink-0 text-muted-foreground';

function computeMenuPosition(anchorRect) {
  const pad = 8;
  let left = Math.min(anchorRect.left, window.innerWidth - MENU_WIDTH - pad);
  if (left < pad) left = pad;

  let top = anchorRect.bottom + 6;
  if (top + EST_MENU_HEIGHT > window.innerHeight - pad) {
    top = anchorRect.top - EST_MENU_HEIGHT - 6;
  }
  if (top < pad) top = pad;
  if (top + EST_MENU_HEIGHT > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - EST_MENU_HEIGHT - pad);
  }
  return { left, top };
}

function MenuItem({ label, Icon, onSelect, className = ITEM_CLASS, iconClassName = ICON_CLASS, ...rest }) {
  return (
    <button type="button" role="menuitem" className={className} onClick={onSelect} {...rest}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon className={iconClassName} aria-hidden />
    </button>
  );
}

/**
 * Menu ngữ cảnh tin nhắn (mục "⋯" / chuột phải).
 */
export default function ChannelMessageMoreMenu({
  open,
  anchorRect,
  onClose,
  isMine,
  onCopyText,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onRecall,
  /** Tin nhắn văn bản — cho phép sao chép */
  canCopy,
  /** Tạo task bằng AI */
  onCreateTask,
  createTaskDisabled = false,
  /** Hiển thị khi hover (đặc biệt khi disabled) */
  createTaskHoverTitle = '',
  onPinToggle,
  pinLabel = '',
  /** Quyền canDelete của kênh — cho phép xóa tin người khác. */
  canDeleteOthers = false,
}) {
  const { t } = useAppStrings();
  const menuRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    const raf = requestAnimationFrame(() => {
      menuRef.current?.querySelector('button[role="menuitem"]:not([disabled])')?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus();
      }
    };
  }, [open]);

  if (!open || !anchorRect) return null;

  const { left, top } = computeMenuPosition(anchorRect);
  const select = (action) => () => {
    action?.();
    onClose();
  };
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      return;
    }
    handlePickerListKeyDown(event);
  };
  const showDelete = isMine || canDeleteOthers;

  return createPortal(
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('orgPanel.closeMenuAria')}
        className={`${shellNavRailBackdrop} z-[80] cursor-default bg-black/20`}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="fixed z-[90] w-64 overflow-y-auto rounded-xl border border-border bg-card py-1 text-sm text-foreground shadow-xl motion-safe:animate-fade-in-fast"
        style={{ left, top, maxHeight: 'min(70vh, 420px)' }}
        role="menu"
        aria-label={t('orgPanel.messageMenuAria')}
        onKeyDown={handleKeyDown}
      >
        {canCopy && (
          <MenuItem label={t('orgPanel.menuCopyMessage')} Icon={Copy} onSelect={select(onCopyText)} />
        )}
        {!isMine && (
          <MenuItem label={t('orgPanel.menuReply')} Icon={Reply} onSelect={select(onReply)} />
        )}
        <MenuItem label={t('orgPanel.menuForward')} Icon={Forward} onSelect={select(onForward)} />
        {typeof onCreateTask === 'function' && (
          <button
            type="button"
            role="menuitem"
            disabled={createTaskDisabled}
            aria-disabled={createTaskDisabled}
            title={createTaskHoverTitle || t('orgPanel.menuCreateTaskHint')}
            className={`${ITEM_CLASS} disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent`}
            onClick={() => {
              if (createTaskDisabled) return;
              onCreateTask();
              onClose();
            }}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{t('orgPanel.menuCreateTaskAi')}</span>
            </span>
            <Bot className={ICON_CLASS} aria-hidden />
          </button>
        )}
        {isMine && typeof onEdit === 'function' && (
          <MenuItem label={t('orgPanel.menuEditMessage')} Icon={Pencil} onSelect={select(onEdit)} />
        )}
        {typeof onPinToggle === 'function' && (
          <MenuItem
            label={pinLabel || t('orgPanel.menuPinMessage')}
            Icon={Pin}
            onSelect={select(onPinToggle)}
          />
        )}
        {(isMine && typeof onRecall === 'function') || showDelete ? (
          <div className="my-1 h-px bg-border" role="separator" />
        ) : null}
        {isMine && typeof onRecall === 'function' && (
          <MenuItem
            label={t('orgPanel.menuRecallMessage')}
            Icon={Undo2}
            onSelect={select(onRecall)}
            className={`${ITEM_CLASS} text-warning`}
          />
        )}
        {showDelete && (
          <MenuItem
            label={isMine ? t('orgPanel.menuDeleteMessage') : t('orgPanel.menuDeleteMessageModerator')}
            Icon={Trash2}
            onSelect={select(onDelete)}
            className={DANGER_ITEM_CLASS}
            iconClassName="h-4 w-4 shrink-0"
          />
        )}
      </div>
    </>,
    document.body
  );
}
