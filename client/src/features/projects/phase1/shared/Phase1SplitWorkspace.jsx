import { useEffect, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';

const LG_MQ = '(min-width: 1024px)';

/**
 * Desktop ≥ lg: list full-width; detail pane only when an item is selected.
 * &lt; lg: list full; detail as right sheet when selected.
 * Only one detail tree mounts at a time (avoids duplicate related buttons / double handlers).
 */
export default function Phase1SplitWorkspace({
  list,
  detail = null,
  hasSelection = false,
  onCloseDetail,
  emptyDetail: _emptyDetail = null,
  className = '',
  detailWidthClass = 'lg:w-[min(420px,38%)]',
}) {
  const { t } = useAppStrings();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(LG_MQ).matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia(LG_MQ);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showDetail = Boolean(hasSelection && detail);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:gap-0 ${className}`}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{list}</div>

      {showDetail && isDesktop ? (
        <aside
          className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-surface ${detailWidthClass}`}
          aria-label={t('workspace.phase1SplitDetailAria')}
        >
          {detail}
        </aside>
      ) : null}

      {showDetail && !isDesktop ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/25"
            aria-label={t('common.close')}
            onClick={onCloseDetail}
          />
          <aside
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
            aria-label={t('workspace.phase1SplitDetailAria')}
          >
            {detail}
          </aside>
        </>
      ) : null}
    </div>
  );
}
