import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg, threeFrameRightPanel } from '../../theme/shellTheme';
import NavigationSidebar from './NavigationSidebar';
import ShellWaveBackdrop from './ShellWaveBackdrop';
import { useAppStrings } from '../../locales/appStrings';
import {
  ORG_RIGHT_PANEL_MAX_W,
  ORG_RIGHT_PANEL_MIN_W,
} from '../../utils/orgWorkspaceLayoutPrefs';

function parseRightWidthToPx(rightWidth) {
  if (typeof rightWidth === 'number' && Number.isFinite(rightWidth)) {
    return Math.round(rightWidth);
  }
  const s = String(rightWidth || '').trim();
  const m = s.match(/w-\[(\d+)px\]/);
  if (m) return Number(m[1]);
  if (s === 'w-96') return 384;
  if (s === 'w-80') return 320;
  if (s === 'w-72') return 288;
  if (s === 'w-64') return 256;
  return 280;
}

/**
 * Bố cục chuẩn 3 khung.
 * Site phải: resize + double-click reset; parent truyền right=null để collapse.
 */
const ThreeFrameLayout = ({
  landingDemo = false,
  left,
  center,
  right = null,
  rightWidth = 'w-80',
  rightFrameClassName = null,
  centerScrollable = true,
  /** Gọi khi kéo xong / reset — parent persist. */
  onRightWidthChange,
  /** Hiển thị cột phải dạng drawer trên <lg (khi right !== null). */
  rightAsMobileDrawer = false,
  onCloseRightMobile,
}) => {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const shell = appShellBg(isDarkMode);
  const rightPanel = threeFrameRightPanel(isDarkMode);
  const embeddedSuiteLayout = left === false;
  const navLeft = embeddedSuiteLayout ? null : (left ?? <NavigationSidebar landingDemo={landingDemo} />);
  const baseRightW = useMemo(() => parseRightWidthToPx(rightWidth), [rightWidth]);
  const maxRightW = Math.max(baseRightW, ORG_RIGHT_PANEL_MAX_W);
  const minRightW = ORG_RIGHT_PANEL_MIN_W;
  const [rightW, setRightW] = useState(() =>
    Math.max(minRightW, Math.min(maxRightW, baseRightW))
  );
  const rightWRef = useRef(rightW);
  rightWRef.current = rightW;
  const resizingRef = useRef(null);
  const rootClass = embeddedSuiteLayout
    ? 'relative flex h-full min-h-0 overflow-hidden bg-background'
    : `relative flex h-screen overflow-hidden ${shell}`;
  const centerFrameClass = embeddedSuiteLayout
    ? 'relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
    : 'relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-2 pl-2 pr-1';
  const centerInnerClass = embeddedSuiteLayout
    ? centerScrollable
      ? 'scrollbar-overlay min-h-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto'
      : 'flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden'
    : centerScrollable
      ? 'scrollbar-overlay flex-1 min-h-0 overflow-x-visible overflow-y-auto rounded-xl'
      : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl';
  const rightPanelFrameClass = embeddedSuiteLayout
    ? 'relative z-[1] flex h-full shrink-0 items-stretch'
    : 'relative z-[1] flex h-full shrink-0 items-stretch py-2 pr-2';

  useEffect(() => {
    setRightW(Math.max(minRightW, Math.min(maxRightW, baseRightW)));
  }, [baseRightW, minRightW, maxRightW]);

  useEffect(() => {
    const onMove = (e) => {
      const st = resizingRef.current;
      if (!st || !st.active) return;
      const x = e?.clientX ?? 0;
      const dx = st.startX - x;
      const next = Math.round(st.startW + dx);
      const clamped = Math.max(st.minW, Math.min(st.maxW, next));
      setRightW(clamped);
      e?.preventDefault?.();
    };
    const onUp = () => {
      const st = resizingRef.current;
      if (!st || !st.active) return;
      resizingRef.current = null;
      onRightWidthChange?.(rightWRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onRightWidthChange]);

  useEffect(() => {
    if (!rightAsMobileDrawer || right === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRightMobile?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rightAsMobileDrawer, right, onCloseRightMobile]);

  const renderRightPanelBody = (opts = {}) => {
    const { drawer = false } = opts;
    return (
      <div
        className={`relative flex min-h-0 flex-col overflow-hidden ${rightPanel} ${
          drawer ? 'h-full w-full max-w-[min(100vw,420px)] shadow-2xl' : ''
        }`}
        style={
          drawer
            ? undefined
            : {
                width: rightW,
                minWidth: minRightW,
                maxWidth: maxRightW,
              }
        }
        role={drawer ? 'dialog' : undefined}
        aria-label={drawer ? t('organizations.memberDockLabel') : undefined}
      >
        {!drawer ? (
          <div
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize"
            title={t('organizations.layoutResizeDblClickHint', {
              min: minRightW,
              max: maxRightW,
            })}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              resizingRef.current = {
                active: true,
                startX: e.clientX,
                startW: rightW,
                minW: minRightW,
                maxW: maxRightW,
              };
              e.preventDefault();
            }}
            onDoubleClick={() => {
              setRightW(baseRightW);
              onRightWidthChange?.(baseRightW);
            }}
          />
        ) : null}
        <div className="scrollbar-overlay flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {right}
        </div>
      </div>
    );
  };

  return (
    <div className={rootClass}>
      {!embeddedSuiteLayout && <ShellWaveBackdrop />}
      {navLeft ? <div className="relative h-full shrink-0 pointer-events-none">{navLeft}</div> : null}

      <div className={centerFrameClass} style={{ minWidth: 0 }}>
        <div className={centerInnerClass}>{center}</div>
      </div>

      {right !== null && rightFrameClassName ? (
        <div className={`${rightPanelFrameClass} hidden lg:flex`}>{right}</div>
      ) : null}

      {right !== null && !rightFrameClassName ? (
        <>
          <div className={`${rightPanelFrameClass} hidden lg:flex`}>{renderRightPanelBody()}</div>
          {rightAsMobileDrawer ? (
            <div className="fixed inset-0 z-40 flex justify-end lg:hidden" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label={t('nav.close')}
                onClick={() => onCloseRightMobile?.()}
              />
              <div className="relative z-[1] h-full w-[min(100vw,420px)]">{renderRightPanelBody({ drawer: true })}</div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default ThreeFrameLayout;
