import { wizardUi } from '../wizard/projectWizardUi';
import AiStaffingProposalPanel from '../../requirements/AiStaffingProposalPanel';
import { formatAiPlanningSuggestionProfile } from '../../../utils/aiPlanningSuggestionDisplay';
import { Check, X } from 'lucide-react';

/**
 * Step 3 — review AI staffing proposal + role shortlists (advisory).
 * Leaf LLM assign lives on the Assign step.
 */
export default function AiWizardStepReview({
  pack,
  busy,
  canApproveStaffing = false,
  onApproveStaffing,
  onDiscardStaffing,
  t,
}) {
  const overlay = pack?.aiPlanning?.overlay || {};
  const roles = Array.isArray(overlay.roles) ? overlay.roles : [];
  const gaps = Array.isArray(overlay.gaps) ? overlay.gaps : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.reviewTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.reviewSubtitle')}</p>
      </div>

      <AiStaffingProposalPanel
        overlay={overlay}
        t={t}
        canApproveStaffing={canApproveStaffing}
        busy={busy}
        onApproveStaffing={onApproveStaffing}
        onDiscardStaffing={onDiscardStaffing}
        approveButtonVariant="primary"
        ApproveButtonComponent={({ children, className, disabled, onClick }) => (
          <button
            type="button"
            className={`${wizardUi.primaryBtn} inline-flex items-center gap-1.5 ${className || ''}`}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </button>
        )}
        DiscardButtonComponent={({ children, className, disabled, onClick }) => (
          <button
            type="button"
            className={`${wizardUi.secondaryBtn} inline-flex items-center gap-1.5 ${className || ''}`}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </button>
        )}
        approveButtonClassName=""
        discardButtonClassName=""
        renderApproveIcon={() => <Check className="h-3.5 w-3.5" />}
        renderDiscardIcon={() => <X className="h-3.5 w-3.5" />}
      />

      {roles.length === 0 ? (
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
                    {top.map((s) => {
                      const profileLine = formatAiPlanningSuggestionProfile(s, t);
                      return (
                        <li key={`${role.roleKey}-${s.userId}`}>
                          {s.displayName || s.userId} ({s.score})
                          {profileLine ? (
                            <span className="block opacity-80">{profileLine}</span>
                          ) : null}
                          {s.rationale ? (
                            <span className="block opacity-90">— {s.rationale}</span>
                          ) : null}
                        </li>
                      );
                    })}
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
