import { X } from 'lucide-react';

/**
 * Right-side finding detail drawer for AI Analysis Job Result rows.
 */
export default function AiAnalysisFindingDrawer({
  open,
  finding,
  t,
  onClose,
  onAccept,
  onReject,
  onEditRequirement,
  decision = null,
}) {
  if (!open || !finding) return null;

  return (
    <div className="fixed inset-0 z-[10040] flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label={t('common.close') || 'Close'}
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('requirements.aiAnalysisDrawerRequirementId')}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-foreground">{finding.id}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{finding.requirement}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <Field label={t('requirements.aiAnalysisDrawerAssessment')}>
            <span className="font-medium text-foreground">{finding.assessmentLabel}</span>
          </Field>
          <Field label={t('requirements.aiAnalysisDrawerFinding')}>
            <p className="text-foreground">{finding.finding}</p>
          </Field>
          <Field label={t('requirements.aiAnalysisDrawerImpact')}>
            <span className="font-medium text-foreground">{finding.impact}</span>
          </Field>
          <Field label={t('requirements.aiAnalysisDrawerRecommendation')}>
            <p className="text-foreground">{finding.recommendation}</p>
          </Field>
          <Field label={t('requirements.aiAnalysisDrawerSource')}>
            <p className="text-muted-foreground">{finding.source}</p>
          </Field>
          {decision ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {decision === 'accepted'
                ? t('requirements.aiAnalysisFindingAccepted')
                : t('requirements.aiAnalysisFindingRejected')}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => onEditRequirement?.(finding)}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            {t('requirements.aiAnalysisEditRequirement')}
          </button>
          <button
            type="button"
            onClick={() => onAccept?.(finding)}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t('requirements.aiAnalysisAcceptFinding')}
          </button>
          <button
            type="button"
            onClick={() => onReject?.(finding)}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            {t('requirements.aiAnalysisRejectFinding')}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
