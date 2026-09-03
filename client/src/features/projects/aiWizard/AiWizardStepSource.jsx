import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { wizardUi } from '../wizard/projectWizardUi';
import { AI_WIZARD_PACK_PAGE_SIZE } from './aiWizardConstants';

/**
 * Step 1 — pick an approved requirement pack, then the wizard advances.
 */
export default function AiWizardStepSource({
  approvedPacks,
  packsLoading,
  packsError,
  pack,
  busy,
  onSelectPack,
  onRetryPacks,
  t,
}) {
  const packId = String(pack?._id || '').trim();
  const packs = Array.isArray(approvedPacks) ? approvedPacks : [];
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(packs.length / AI_WIZARD_PACK_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedPacks = useMemo(() => {
    const start = (safePage - 1) * AI_WIZARD_PACK_PAGE_SIZE;
    return packs.slice(start, start + AI_WIZARD_PACK_PAGE_SIZE);
  }, [packs, safePage]);

  useEffect(() => {
    setPage(1);
  }, [packs.length]);

  useEffect(() => {
    if (!packId || packs.length === 0) return;
    const idx = packs.findIndex((item) => String(item._id || '') === packId);
    if (idx < 0) return;
    setPage(Math.floor(idx / AI_WIZARD_PACK_PAGE_SIZE) + 1);
  }, [packId, packs]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const showPager = packs.length > AI_WIZARD_PACK_PAGE_SIZE;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.sourceTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.sourceSubtitle')}</p>
      </div>

      {packsLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : packsError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{t('aiCreateWizard.loadPacksFail')}</p>
          <button
            type="button"
            className={wizardUi.secondaryBtn}
            onClick={onRetryPacks}
            disabled={busy}
          >
            {t('aiCreateWizard.loadPacksRetry')}
          </button>
        </div>
      ) : packs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('aiCreateWizard.noApprovedPacks')}</p>
      ) : (
        <div>
          <ul className="space-y-2">
            {pagedPacks.map((item) => {
              const id = String(item._id || '');
              const selected = id === packId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={selected ? wizardUi.statusCardActive : wizardUi.rowCard}
                    disabled={busy}
                    aria-pressed={selected}
                    onClick={() => onSelectPack?.(item)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.overview?.requirementName || item.sourceFileName || id}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t(`requirements.status.${item.status}`)}
                        {item.planningReadiness?.score != null
                          ? ` · ${t('requirements.planningScore', {
                              score: item.planningReadiness.score,
                            })}`
                          : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {showPager ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                aria-label={t('requirements.listPrev')}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {t('requirements.listPrev')}
              </button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {t('requirements.listPage', { page: safePage, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                aria-label={t('requirements.listNext')}
              >
                {t('requirements.listNext')}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
