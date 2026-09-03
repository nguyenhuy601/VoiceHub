import { Check, X } from 'lucide-react';
import GradientButton from '../../components/Shared/GradientButton';

function validationStatusLabel(status, t) {
  const key = String(status || 'ok');
  return t(`requirements.aiStaffingValidation.${key}`) || key;
}

function ValidationList({ items, variant, t }) {
  if (!items?.length) return null;
  const className =
    variant === 'error'
      ? 'text-destructive'
      : 'text-amber-700 dark:text-amber-300';
  return (
    <ul className={`mt-2 space-y-1 text-xs ${className}`}>
      {items.map((item, index) => (
        <li key={`${item.code || 'item'}-${index}`}>
          {item.message || item.code}
        </li>
      ))}
    </ul>
  );
}

function RoleList({ roles, t }) {
  if (!roles?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {roles.map((r) => (
        <li key={r.roleKey}>
          {r.roleKey} ×{r.requiredCount}
          {r.leafCount != null ? (
            <span className="opacity-80">
              {' '}
              ({t('requirements.aiStaffingLeafCount', { count: r.leafCount })})
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function hoursDeltaClassName(pct) {
  if (pct == null) return 'text-muted-foreground';
  if (pct > 50) return 'text-destructive';
  if (pct > 25) return 'text-amber-700 dark:text-amber-300';
  return 'text-muted-foreground';
}

function StaffingDeltaSummary({ delta, t }) {
  if (!delta || typeof delta !== 'object') return null;

  const hasRoles =
    delta.rolesAdded?.length ||
    delta.rolesRemoved?.length ||
    delta.roleCountChanges?.length;
  const hasSkills = delta.skillsAdded?.length || delta.skillsRemoved?.length;
  const hasHours = delta.hoursDeltaPct != null;

  if (!hasRoles && !hasSkills && !hasHours) return null;

  return (
    <div className="rounded-md border border-border bg-muted/10 p-2">
      <p className="text-xs font-semibold text-foreground">
        {t('requirements.aiStaffingDeltaTitle')}
      </p>

      {hasRoles ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {delta.rolesAdded?.length ? (
            <p>
              {t('requirements.aiStaffingDeltaRolesAdded')}: {delta.rolesAdded.join(', ')}
            </p>
          ) : null}
          {delta.rolesRemoved?.length ? (
            <p>
              {t('requirements.aiStaffingDeltaRolesRemoved')}: {delta.rolesRemoved.join(', ')}
            </p>
          ) : null}
          {delta.roleCountChanges?.map((row) => (
            <p key={row.roleKey}>
              {t('requirements.aiStaffingDeltaRoleCount', {
                role: row.roleKey,
                baseline: row.baselineFte,
                proposal: row.proposalCount,
              })}
            </p>
          ))}
        </div>
      ) : null}

      {hasSkills ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {delta.skillsAdded?.length ? (
            <p>
              {t('requirements.aiStaffingDeltaSkillsAdded')}: {delta.skillsAdded.join(', ')}
            </p>
          ) : null}
          {delta.skillsRemoved?.length ? (
            <p>
              {t('requirements.aiStaffingDeltaSkillsRemoved')}: {delta.skillsRemoved.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasHours ? (
        <p className={`mt-2 text-xs ${hoursDeltaClassName(delta.hoursDeltaPct)}`}>
          {t('requirements.aiStaffingDeltaHours', { pct: delta.hoursDeltaPct })}
        </p>
      ) : null}
    </div>
  );
}

function StaffingAuditHint({ audit, t }) {
  const events = audit?.events;
  if (!events?.length) return null;
  const latest = events[events.length - 1];
  if (!latest?.action) return null;

  const actionLabel =
    latest.action === 'approved'
      ? t('requirements.aiStaffingAuditApproved')
      : latest.action === 'discarded'
        ? t('requirements.aiStaffingAuditDiscarded')
        : latest.action;

  const atLabel = latest.at
    ? new Date(latest.at).toLocaleString()
    : '';

  return (
    <p className="text-xs text-muted-foreground">
      {t('requirements.aiStaffingAuditLatest', { action: actionLabel, at: atLabel })}
    </p>
  );
}

/**
 * Shared staffing proposal + baseline + validation panel for AI Planning overlay.
 */
export default function AiStaffingProposalPanel({
  overlay = {},
  t,
  canRunAiPlanning = false,
  canApproveStaffing,
  busy = false,
  onApproveStaffing,
  onDiscardStaffing,
  approveButtonVariant = 'success',
  ApproveButtonComponent = GradientButton,
  DiscardButtonComponent = GradientButton,
  approveButtonClassName = 'px-3 py-1.5 text-xs',
  discardButtonClassName = 'px-3 py-1.5 text-xs',
  renderApproveIcon = () => <Check className="h-3.5 w-3.5" />,
  renderDiscardIcon = () => <X className="h-3.5 w-3.5" />,
}) {
  const proposal = overlay.staffingProposal;
  const validation = overlay.proposalValidation || {};
  const baseline = overlay.baselineStaffing;
  const llm = overlay.llm || {};

  const proposalPending =
    proposal &&
    typeof proposal === 'object' &&
    !proposal.accepted &&
    !overlay.staffingProposalAcceptedAt &&
    validation.status !== 'rejected';

  const rejectedSemantic =
    validation.status === 'rejected' ||
    llm.staffingStatus === 'rejected_semantic';

  const approveAllowed = canApproveStaffing ?? canRunAiPlanning;

  const canApprove =
    proposalPending &&
    approveAllowed &&
    validation.status !== 'rejected';

  const showDelta =
    validation?.delta &&
    (proposalPending || validation.status === 'warnings');

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('requirements.aiStaffingRankingHint')}</p>

      {baseline?.fteRoles?.length ? (
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="text-xs font-semibold text-foreground">
            {t('requirements.aiStaffingBaselineTitle')}
          </p>
          <RoleList roles={baseline.fteRoles} t={t} />
          {baseline.totalLeafHours != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('requirements.aiStaffingHours', { hours: baseline.totalLeafHours })}
            </p>
          ) : null}
        </div>
      ) : null}

      {validation.status && validation.status !== 'skipped' ? (
        <div className="rounded-md border border-border bg-muted/10 p-2">
          <p className="text-xs font-semibold text-foreground">
            {t('requirements.aiStaffingValidationTitle')}:{' '}
            <span className="font-normal text-muted-foreground">
              {validationStatusLabel(validation.status, t)}
            </span>
          </p>
          <ValidationList items={validation.errors} variant="error" t={t} />
          <ValidationList items={validation.warnings} variant="warning" t={t} />
        </div>
      ) : null}

      {showDelta ? <StaffingDeltaSummary delta={validation.delta} t={t} /> : null}

      {rejectedSemantic && !proposalPending ? (
        <p className="text-xs text-destructive">{t('requirements.aiStaffingRejectedSemantic')}</p>
      ) : null}

      {proposalPending ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <p className="text-xs font-semibold text-foreground">
            {t('requirements.aiStaffingProposalTitle')}
          </p>
          {proposal.rationale ? (
            <p className="mt-1 text-xs text-muted-foreground">{proposal.rationale}</p>
          ) : null}
          <RoleList
            roles={(proposal.requiredRoles || []).map((r) => ({
              roleKey: r.roleKey,
              requiredCount: r.requiredCount,
            }))}
            t={t}
          />
          {(proposal.requiredSkills || []).length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {(proposal.requiredSkills || []).map((s) => s.name || s).join(', ')}
            </p>
          ) : null}
          {proposal.estimatedHoursTotal != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('requirements.aiStaffingHours', { hours: proposal.estimatedHoursTotal })}
            </p>
          ) : null}
          {canApprove ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <ApproveButtonComponent
                variant={approveButtonVariant}
                disabled={busy}
                onClick={onApproveStaffing}
                className={approveButtonClassName}
              >
                {renderApproveIcon()}
                {t('requirements.aiStaffingApprove')}
              </ApproveButtonComponent>
              <DiscardButtonComponent
                variant="shell"
                disabled={busy}
                onClick={onDiscardStaffing}
                className={discardButtonClassName}
              >
                {renderDiscardIcon()}
                {t('requirements.aiStaffingDiscard')}
              </DiscardButtonComponent>
            </div>
          ) : null}
          {proposalPending && !canApprove && validation.status === 'warnings' ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {approveAllowed
                ? t('requirements.aiStaffingWarningsHint')
                : t('requirements.aiStaffingApproveNeedPermission')}
            </p>
          ) : null}
          {proposalPending && !canApprove && rejectedSemantic ? (
            <p className="mt-2 text-xs text-destructive">
              {t('requirements.aiStaffingRejectedSemantic')}
            </p>
          ) : null}
        </div>
      ) : null}

      {overlay.staffingProposalAcceptedAt ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          {t('requirements.aiStaffingAccepted')}
        </p>
      ) : null}

      <StaffingAuditHint audit={overlay.staffingAudit} t={t} />
    </div>
  );
}
