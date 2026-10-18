import { Check, Circle } from 'lucide-react';
import { deliveryPhaseLabelKey } from '../../../utils/projectPhaseNav';
import { PROJECT_ROLE_LABELS } from '../../../utils/roleTaxonomy';
import {
  gateRoleKeys,
  intakeSlotFilled,
  normalizeGateSlots,
} from '../wizard/projectWizardIntakeRoles';
import { intakeUi } from './intakeUi';
import { buildIntakeSectionMeta, intakeErrorCount } from './projectIntakeValidation';

function ChecklistRow({ ok, label }) {
  return (
    <li className="flex items-center gap-2 text-muted-foreground">
      {ok ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" />
      )}
      <span className={ok ? 'text-foreground' : ''}>{label}</span>
    </li>
  );
}

function GateSummaryList({ processKey, gates, t }) {
  const keys = gateRoleKeys(gates, processKey);
  if (!keys.length) {
    return <p className={intakeUi.summaryRow}>{t('adminTasks.intakeNoneYet')}</p>;
  }
  return (
    <ul className="mt-1 space-y-1">
      {keys.map((key) => {
        const slot = gates[processKey]?.[key];
        const ok = intakeSlotFilled(gates[processKey], key);
        const label = PROJECT_ROLE_LABELS[key] || key;
        return (
          <li key={key} className="flex items-center gap-2 text-sm">
            {ok ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">{label}</span>
            {ok && slot?.displayName ? (
              <span className="truncate text-foreground">· {slot.displayName}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function ProjectSummaryPanel({
  form,
  fieldErrors,
  showErrors,
  onIssueClick,
  t,
  compact = false,
}) {
  const gates = normalizeGateSlots(form.gateSlots);
  const sections = buildIntakeSectionMeta(form, fieldErrors, showErrors);
  const errorCount = showErrors ? intakeErrorCount(fieldErrors) : 0;
  const ready = errorCount === 0 && sections.requirements.complete && sections.information.complete && sections.team.complete && sections.analysis.complete;

  const modeLabel =
    form.analysisMode === 'ai'
      ? t('adminTasks.intakeModeAiTitle')
      : form.analysisMode === 'manual'
        ? t('adminTasks.wizardModeManual')
        : t('adminTasks.intakeNotSelected');

  const panel = (
    <div className={intakeUi.summaryPanel}>
      <p className={intakeUi.summaryLabel}>
        {t('adminTasks.intakeSummaryTitle')}
      </p>

      <div className={compact ? 'mt-3 space-y-3' : 'mt-4 space-y-4'}>
        <div>
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeSummaryProject')}</p>
          <p className={intakeUi.summaryRow}>{form.title?.trim() || '—'}</p>
        </div>
        {form.customerName ? (
          <div>
            <p className="text-xs text-muted-foreground">
              {t('adminTasks.wizardCustomerName')}
            </p>
            <p className={intakeUi.summaryRow}>{form.customerName}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryAnalysis')}
          </p>
          <p className={intakeUi.summaryRow}>{modeLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSectionAnalysisTeam')}
          </p>
          <GateSummaryList processKey="what" gates={gates} t={t} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSectionPlanningTeam')}
          </p>
          <GateSummaryList processKey="how" gates={gates} t={t} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryRequirement')}
          </p>
          <p className={intakeUi.summaryRow}>
            {form.intakeFiles?.requirement?.name ||
              t('adminTasks.intakeNoneYet')}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeSummaryPhase')}</p>
          <p className={intakeUi.summaryRow}>{t(deliveryPhaseLabelKey('requirement_analysis'))}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {showErrors && errorCount > 0 ? (
          <button
            type="button"
            className="w-full text-left text-sm text-destructive hover:underline"
            onClick={onIssueClick}
          >
            {t('adminTasks.intakeIssuesCount', { n: errorCount }) ||
              `${errorCount} mục cần xử lý`}
          </button>
        ) : ready ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            {t('adminTasks.intakeReadyToCreate')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryHint')}
          </p>
        )}
        {!compact ? (
          <ul className={`${intakeUi.summaryChecklist} mt-3`}>
            <ChecklistRow
              ok={sections.requirements.complete}
              label={t('adminTasks.intakeCheckRequirement')}
            />
            <ChecklistRow
              ok={sections.information.complete}
              label={t('adminTasks.intakeCheckIdentity')}
            />
            <ChecklistRow
              ok={sections.analysisTeam?.complete}
              label={t('adminTasks.intakeCheckAnalysisTeam')}
            />
            <ChecklistRow
              ok={sections.planningTeam?.complete}
              label={t('adminTasks.intakeCheckPlanningTeam')}
            />
            <ChecklistRow
              ok={sections.analysis.complete}
              label={t('adminTasks.intakeCheckAnalysis')}
            />
          </ul>
        ) : null}
      </div>
    </div>
  );

  return panel;
}
