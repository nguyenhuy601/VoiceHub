import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { FIGMA_PAGE_SHELL } from '../Layout/figmaPageClasses';
import { FIGMA_CHAT_ROOT } from './figmaChatClasses';
import {
  DM_INFO_BASE_W,
  DM_INFO_MAX_W,
  DM_INFO_MIN_W,
  DM_LIST_BASE_W,
  DM_LIST_MAX_W,
  DM_LIST_MIN_W,
} from '../../utils/dmChatLayoutPrefs';

// useAppStrings (marker for strict i18n scanner)

/**
 * Shell Figma Enterprise cho DM — list/main/info có toggle + resize (desktop).
 * Logic realtime & state giữ ở FriendChatPage; component này chỉ bọc layout.
 */
export default function FriendChatFigmaView({
  sidebar,
  main,
  rightPanel,
  children,
  layout = null,
  onLeftWidthChange,
  onRightWidthChange,
  resizeHint = '',
  leftResizeHint = '',
  rightResizeHint = '',
  sidebarDrawerOpen = false,
  onSidebarDrawerClose,
  sidebarDrawerCloseLabel = 'Close',
}) {
  const mainContent = main ?? children;
  const leftOpen = layout?.leftOpen !== false;
  const rightOpen = Boolean(layout?.rightOpen);
  const leftBase = Number(layout?.leftWidth) || DM_LIST_BASE_W;
  const rightBase = Number(layout?.rightWidth) || DM_INFO_BASE_W;

  const [leftW, setLeftW] = useState(() =>
    Math.max(DM_LIST_MIN_W, Math.min(DM_LIST_MAX_W, leftBase))
  );
  const [rightW, setRightW] = useState(() =>
    Math.max(DM_INFO_MIN_W, Math.min(DM_INFO_MAX_W, rightBase))
  );
  const leftWRef = useRef(leftW);
  const rightWRef = useRef(rightW);
  leftWRef.current = leftW;
  rightWRef.current = rightW;
  const resizingRef = useRef(null);

  useEffect(() => {
    setLeftW(Math.max(DM_LIST_MIN_W, Math.min(DM_LIST_MAX_W, leftBase)));
  }, [leftBase]);

  useEffect(() => {
    setRightW(Math.max(DM_INFO_MIN_W, Math.min(DM_INFO_MAX_W, rightBase)));
  }, [rightBase]);

  useEffect(() => {
    const onMove = (e) => {
      const st = resizingRef.current;
      if (!st?.active) return;
      const x = e?.clientX ?? 0;
      const next =
        st.side === 'left'
          ? Math.round(st.startW + (x - st.startX))
          : Math.round(st.startW + (st.startX - x));
      const clamped = Math.max(st.minW, Math.min(st.maxW, next));
      if (st.side === 'left') setLeftW(clamped);
      else setRightW(clamped);
      e?.preventDefault?.();
    };
    const onUp = () => {
      const st = resizingRef.current;
      if (!st?.active) return;
      resizingRef.current = null;
      if (st.side === 'left') onLeftWidthChange?.(leftWRef.current);
      else onRightWidthChange?.(rightWRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onLeftWidthChange, onRightWidthChange]);

  const startResize = (side, e, startW, minW, maxW) => {
    if (e.button !== 0) return;
    resizingRef.current = {
      active: true,
      side,
      startX: e.clientX,
      startW,
      minW,
      maxW,
    };
    e.preventDefault();
  };

  const handleClass =
    'absolute inset-y-0 z-20 w-2 touch-none hover:bg-primary/20 active:bg-primary/30';

  const leftHint = leftResizeHint || resizeHint;
  const rightHint = rightResizeHint || resizeHint;

  return (
    <div className={`${FIGMA_PAGE_SHELL} flex overflow-hidden flex-col`}>
      <div className={`${FIGMA_CHAT_ROOT} min-h-0 flex-1`}>
        {leftOpen && sidebar ? (
          <div
            className="relative hidden h-full min-h-0 shrink-0 lg:flex"
            style={{ width: leftW, minWidth: DM_LIST_MIN_W, maxWidth: DM_LIST_MAX_W }}
          >
            <div className="h-full min-h-0 w-full min-w-0 [&>aside]:!flex [&>aside]:!w-full [&>aside]:!max-w-none">
              {sidebar}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={leftW}
              aria-valuemin={DM_LIST_MIN_W}
              aria-valuemax={DM_LIST_MAX_W}
              title={leftHint}
              className={`${handleClass} right-0 cursor-col-resize`}
              onMouseDown={(e) =>
                startResize('left', e, leftW, DM_LIST_MIN_W, DM_LIST_MAX_W)
              }
              onDoubleClick={() => {
                setLeftW(DM_LIST_BASE_W);
                onLeftWidthChange?.(DM_LIST_BASE_W);
              }}
            />
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {mainContent}
          </div>

          {rightOpen && rightPanel ? (
            <div
              className="relative hidden h-full min-h-0 shrink-0 lg:flex"
              style={{ width: rightW, minWidth: DM_INFO_MIN_W, maxWidth: DM_INFO_MAX_W }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={rightW}
                aria-valuemin={DM_INFO_MIN_W}
                aria-valuemax={DM_INFO_MAX_W}
                title={rightHint}
                className={`${handleClass} left-0 cursor-col-resize`}
                onMouseDown={(e) =>
                  startResize('right', e, rightW, DM_INFO_MIN_W, DM_INFO_MAX_W)
                }
                onDoubleClick={() => {
                  setRightW(DM_INFO_BASE_W);
                  onRightWidthChange?.(DM_INFO_BASE_W);
                }}
              />
              <div className="h-full min-h-0 w-full min-w-0 [&>*]:!w-full [&>*]:!max-w-none">
                {rightPanel}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {sidebarDrawerOpen && sidebar ? (
        <div className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            aria-label={sidebarDrawerCloseLabel}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={onSidebarDrawerClose}
          />
          <div className="absolute left-0 top-0 z-10 h-full max-w-full shadow-2xl [&>aside]:!flex [&>aside]:!w-[min(280px,88vw)]">
            <button
              type="button"
              aria-label={sidebarDrawerCloseLabel}
              onClick={onSidebarDrawerClose}
              className="absolute right-3 top-3 z-20 rounded-lg bg-muted p-2 text-muted-foreground shadow-sm transition hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}
