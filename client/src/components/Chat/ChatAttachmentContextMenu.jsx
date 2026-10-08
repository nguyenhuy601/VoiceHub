import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// useAppStrings (marker for strict i18n scanner)

/**
 * Menu ngữ cảnh Zalo-style cho ảnh/tệp trong sidebar DM.
 */
export default function ChatAttachmentContextMenu({
  open,
  x = 0,
  y = 0,
  items = [],
  onClose,
  isDarkMode: _isDarkMode = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !items.length) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[350] min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 320) }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) item.onClick?.();
            onClose?.();
          }}
          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm motion-safe:transition-colors motion-reduce:transition-none disabled:opacity-40 ${
            item.danger
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-foreground hover:bg-muted'
          }`}
        >
          {item.icon ? (
            <span className="flex w-5 shrink-0 items-center justify-center text-base" aria-hidden>
              {item.icon}
            </span>
          ) : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
