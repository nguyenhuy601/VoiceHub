import { useEffect } from 'react';

function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

/**
 * Phím tắt Inbox thông báo (FE-only, không snooze).
 * J/↓ · K/↑ · Enter · E · Delete · Esc · X · ?
 */
export function useNotificationInboxShortcuts({
  enabled = true,
  itemIds = [],
  selectedId = null,
  bulkMode = false,
  dialogOpen = false,
  onMove,
  onOpen,
  onMarkRead,
  onDelete,
  onEscape,
  onToggleCheck,
  onToggleHelp,
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      if (dialogOpen) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;

      if (lower === '?' || (event.shiftKey && key === '/')) {
        event.preventDefault();
        onToggleHelp?.();
        return;
      }

      if (key === 'Escape') {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (key === 'ArrowDown' || lower === 'j') {
        event.preventDefault();
        onMove?.(1);
        return;
      }

      if (key === 'ArrowUp' || lower === 'k') {
        event.preventDefault();
        onMove?.(-1);
        return;
      }

      if (key === 'Enter' || lower === 'o') {
        if (selectedId == null) return;
        event.preventDefault();
        onOpen?.();
        return;
      }

      if (lower === 'e') {
        if (selectedId == null && !bulkMode) return;
        event.preventDefault();
        onMarkRead?.();
        return;
      }

      if (key === 'Delete' || key === 'Backspace') {
        if (selectedId == null && !bulkMode) return;
        event.preventDefault();
        onDelete?.();
        return;
      }

      if (lower === 'x') {
        event.preventDefault();
        onToggleCheck?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled,
    itemIds,
    selectedId,
    bulkMode,
    dialogOpen,
    onMove,
    onOpen,
    onMarkRead,
    onDelete,
    onEscape,
    onToggleCheck,
    onToggleHelp,
  ]);
}
