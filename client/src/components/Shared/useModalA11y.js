import { useEffect, useRef } from 'react';
import { isTopModal, popModal, pushModal } from './modalStack';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hành vi bàn phím chung cho modal: autofocus, Esc đóng (trừ khi đang bận), bẫy Tab
 * trong `containerRef`, trả focus về phần tử trước đó khi đóng.
 * Chỉ modal trên cùng (modal stack) xử lý phím để modal lồng nhau không đóng sai lớp.
 */
export default function useModalA11y({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
  isBusy = false,
  closeOnEscape = true,
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const stackToken = useRef({});

  useEffect(() => {
    if (!isOpen) return undefined;
    const token = stackToken.current;
    pushModal(token);
    const previouslyFocused = document.activeElement;
    // `autoFocus` của input con đã chạy lúc commit — không cướp focus nếu đã nằm trong modal.
    if (!containerRef?.current?.contains(document.activeElement)) {
      initialFocusRef?.current?.focus();
    }

    const handleKeyDown = (event) => {
      if (!isTopModal(token)) return;
      if (event.key === 'Escape') {
        if (closeOnEscapeRef.current && !isBusyRef.current) {
          event.stopPropagation();
          onCloseRef.current?.();
        }
        return;
      }
      const container = containerRef?.current;
      if (event.key !== 'Tab' || !container) return;
      const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      popModal(token);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
    // Ref objects ổn định; chỉ gắn lại khi mở/đóng.
  }, [isOpen]);
}
