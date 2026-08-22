import { Upload } from 'lucide-react';
import { wizardUi } from '../wizard/projectWizardUi';

/**
 * Step 1 — choose Excel upload or approved pack.
 */
export default function AiWizardStepSource({
  sourceMode,
  setSourceMode,
  preview,
  approvedPacks,
  packsLoading,
  pack,
  busy,
  access,
  onPreviewUpload,
  onConfirmUpload,
  onSelectPack,
  t,
}) {
  const packId = String(pack?._id || '').trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.sourceTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.sourceSubtitle')}</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={sourceMode === 'upload' ? wizardUi.statusCardActive : wizardUi.statusCard}
          onClick={() => setSourceMode('upload')}
          disabled={busy}
        >
          <span className="text-sm font-semibold">{t('aiCreateWizard.tabUpload')}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t('aiCreateWizard.tabUploadHint')}
          </span>
        </button>
        <button
          type="button"
          className={sourceMode === 'pick' ? wizardUi.statusCardActive : wizardUi.statusCard}
          onClick={() => setSourceMode('pick')}
          disabled={busy}
        >
          <span className="text-sm font-semibold">{t('aiCreateWizard.tabPick')}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t('aiCreateWizard.tabPickHint')}
          </span>
        </button>
      </div>

      {sourceMode === 'upload' ? (
        <div className="space-y-3">
          {!access?.canImport ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('aiCreateWizard.uploadNeedsImport')}
            </p>
          ) : (
            <>
              <label className={wizardUi.fieldLabel}>{t('aiCreateWizard.chooseExcel')}</label>
              <label className={`${wizardUi.rowCard} cursor-pointer`}>
                <span className="inline-flex items-center gap-2 text-sm">
                  <Upload className="h-4 w-4" />
                  {preview?.fileName || t('aiCreateWizard.browseFile')}
                </span>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onPreviewUpload?.(file);
                  }}
                />
              </label>
              {preview?.sessionId ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {preview.valid === false
                      ? t('requirements.parsedFail')
                      : t('requirements.parsedOk')}
                    {preview.errorCount != null
                      ? ` · ${preview.errorCount} errors · ${preview.warningCount || 0} warnings`
                      : ''}
                  </p>
                  <button
                    type="button"
                    className={wizardUi.primaryBtn}
                    disabled={busy || preview.valid === false}
                    onClick={onConfirmUpload}
                  >
                    {t('requirements.confirmImport')}
                  </button>
                </div>
              ) : null}
            </>
          )}
          {packId ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {t('aiCreateWizard.packReady', {
                name: pack?.overview?.requirementName || pack?.sourceFileName || packId,
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {packsLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : approvedPacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('aiCreateWizard.noApprovedPacks')}</p>
          ) : (
            <ul className="max-h-[320px] space-y-2 overflow-y-auto">
              {approvedPacks.map((item) => {
                const id = String(item._id || '');
                const selected = id === packId;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={selected ? wizardUi.statusCardActive : wizardUi.rowCard}
                      disabled={busy}
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
          )}
        </div>
      )}
    </div>
  );
}
