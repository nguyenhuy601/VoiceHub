import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_DELAY_MS = 220;

function computeStyle(rect, placement) {
  const gap = 8;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (placement === 'bottom') {
    return { left: cx, top: rect.bottom + gap, transform: 'translate(-50%, 0)' };
  }
  if (placement === 'left') {
    return { left: rect.left - gap, top: cy, transform: 'translate(-100%, -50%)' };
  }
  if (placement === 'right') {
    return { left: rect.right + gap, top: cy, transform: 'translate(0, -50%)' };
  }
  return { left: cx, top: rect.top - gap, transform: 'translate(-50%, -100%)' };
}

/**
 * Tooltip portal neo đúng trigger — thay native `title` (tránh lệch vị trí trình duyệt).
 */
export default function HoverTooltip({
  label,
  children,
  placement = 'top',
  disabled = false,
  className = '',
  delayMs = DEFAULT_DELAY_MS,
}) {
  const tipId = useId();
  const showTimerRef = useRef(null);
  const [tip, setTip] = useState(null);

  const clearTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const hide = () => {
    clearTimer();
    setTip(null);
  };

  const showFrom = (el) => {
    if (disabled || !label || !el) return;
    clearTimer();
    showTimerRef.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTip({ label: String(label), style: computeStyle(rect, placement) });
    }, delayMs);
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!tip) return undefined;
    const onScrollOrResize = () => hide();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [tip]);

  if (!label) {
    return <span className={`inline-flex ${className}`.trim()}>{children}</span>;
  }

  return (
    <>
      <span
        className={`inline-flex max-w-full ${className}`.trim()}
        onMouseEnter={(e) => showFrom(e.currentTarget)}
        onMouseLeave={hide}
        onFocusCapture={(e) => showFrom(e.currentTarget)}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {tip && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[9999] max-w-[16rem] whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium leading-snug text-foreground shadow-lg"
              style={tip.style}
            >
              {tip.label}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
