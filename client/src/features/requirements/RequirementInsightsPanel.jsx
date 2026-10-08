/**
 * Slim panel — Requirement Insights + Proposed SRS + Pre-approval (display only).
 */
export default function RequirementInsightsPanel({
  insights = null,
  proposedSrs = null,
  preApproval = null,
  t = (k) => k,
}) {
  if (!insights && !proposedSrs && !preApproval) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('requirements.insightsEmpty') || 'Chưa có Requirement Insights — chạy job Insights.'}
      </p>
    );
  }

  const clarifications = Array.isArray(insights?.clarifications) ? insights.clarifications : [];
  const deltas = Array.isArray(proposedSrs?.deltas) ? proposedSrs.deltas : [];
  const checks = Array.isArray(preApproval?.checks) ? preApproval.checks : [];

  return (
    <div className="space-y-4 text-sm">
      {preApproval ? (
        <div
          className={`rounded-md border px-3 py-2 ${
            preApproval.passed
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-amber-500/40 bg-amber-500/5'
          }`}
        >
          <p className="font-medium text-foreground">
            {preApproval.passed
              ? t('requirements.preApprovalPassed') || 'Pre-approval: đạt'
              : t('requirements.preApprovalFailed') || 'Pre-approval: chưa đạt'}
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {checks.slice(0, 12).map((c) => (
              <li key={c.id}>
                {c.id}: {c.passed ? 'pass' : 'fail'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {insights?.understanding?.narrative ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('requirements.insightsUnderstanding') || 'Understanding'}
          </p>
          <p className="mt-1 text-foreground">{insights.understanding.narrative}</p>
        </div>
      ) : null}

      {insights?.quality ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('requirements.insightsQuality') || 'Quality (from Facts)'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {[
              insights.quality.coverageWeighted != null
                ? `coverage=${insights.quality.coverageWeighted}`
                : null,
              insights.quality.completenessScore != null
                ? `completeness=${insights.quality.completenessScore}`
                : null,
              insights.quality.gateAPassed != null
                ? `gateA=${insights.quality.gateAPassed}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || insights.quality.summary || '—'}
          </p>
        </div>
      ) : null}

      {clarifications.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('requirements.insightsClarifications') || 'Clarifications'}
          </p>
          <ul className="mt-1 space-y-1">
            {clarifications.slice(0, 20).map((c, i) => (
              <li key={c.id || i} className="rounded border border-border px-2 py-1.5">
                {c.frId ? <span className="font-mono text-xs">{c.frId} · </span> : null}
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {deltas.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('requirements.proposedSrsTitle') || 'Proposed SRS (not applied)'}
          </p>
          <ul className="mt-1 space-y-1">
            {deltas.slice(0, 20).map((d, i) => (
              <li key={d.clarificationId || i} className="rounded border border-dashed border-border px-2 py-1.5">
                <span className="font-mono text-xs">
                  {d.externalId || 'pack'} / {d.field}
                </span>
                <p className="text-muted-foreground">{d.proposedText}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
