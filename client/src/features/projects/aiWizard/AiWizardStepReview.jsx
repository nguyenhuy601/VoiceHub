import { Check, X } from 'lucide-react';
import { wizardUi } from '../wizard/projectWizardUi';

/**
 * Step 3 — review AI staffing proposal + suggestions (no auto-assign).
 */
export default function AiWizardStepReview({
  pack,
  busy,
  onApproveStaffing,
  onDiscardStaffing,
  t,
}) {
  const overlay = pack?.aiPlanning?.overlay || {};
  const roles = Array.isArray(overlay.roles) ? overlay.roles : [];
  const gaps = Array.isArray(overlay.gaps) ? overlay.gaps : [];
  const proposal = overlay.staffingProposal;
  const proposalPending =
    proposal &&
    typeof proposal === 'object' &&
    !proposal.accepted &&
    !overlay.staffingProposalAcceptedAt;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.reviewTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.reviewSubtitle')}</p>
      </div>

      {proposalPending ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t('requirements.aiStaffingProposalTitle')}
          </p>
          {proposal.rationale ? (
            <p className="mt-1 text-xs text-muted-foreground">{proposal.rationale}</p>
          ) : null}
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(proposal.requiredRoles || []).map((r) => (
              <li key={r.roleKey}>
                {r.roleKey} ×{r.requiredCount}
              </li>
            ))}
          </ul>
          {proposal.estimatedHoursTotal != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('requirements.aiStaffingHours', { hours: proposal.estimatedHoursTotal })}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${wizardUi.primaryBtn} inline-flex items-center gap-1.5`}
              disabled={busy}
              onClick={onApproveStaffing}
            >
              <Check className="h-3.5 w-3.5" />
              {t('requirements.aiStaffingApprove')}
            </button>
            <button
              type="button"
              className={`${wizardUi.secondaryBtn} inline-flex items-center gap-1.5`}
              disabled={busy}
              onClick={onDiscardStaffing}
            >
              <X className="h-3.5 w-3.5" />
              {t('requirements.aiStaffingDiscard')}
            </button>
          </div>
        </div>
      ) : null}

      {overlay.staffingProposalAcceptedAt ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          {t('requirements.aiStaffingAccepted')}
        </p>
      ) : null}

      {roles.length === 0 && !proposalPending ? (
        <p className="text-sm text-muted-foreground">{t('aiCreateWizard.noOverlayYet')}</p>
      ) : null}

      {roles.length > 0 ? (
        <ul className="space-y-3">
          {roles.map((role) => {
            const top = (role.suggestions || []).slice(0, 3);
            return (
              <li key={role.roleKey} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">
                  {role.roleKey} ×{role.requiredCount}
                </p>
                {top.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {top.map((s) => (
                      <li key={`${role.roleKey}-${s.userId}`}>
                        {s.displayName || s.userId} ({s.score})
                        {s.rationale ? (
                          <span className="block opacity-90">— {s.rationale}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('requirements.aiPlanningNoCandidates')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {gaps.length > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t('requirements.aiPlanningGaps', { count: gaps.length })}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">{t('aiCreateWizard.noAutoAssignHint')}</p>
    </div>
  );
}
