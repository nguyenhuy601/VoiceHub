import { Check, Circle } from 'lucide-react';
import { deliveryPhaseLabelKey } from '../../../utils/projectPhaseNav';
import {
  INTAKE_LEAD_LABEL_KEYS,
  INTAKE_LEAD_ROLE_KEYS,
  emptyIntakeSlots,
  intakeSlotFilled,
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

export default function ProjectSummaryPanel({
  form,
  fieldErrors,
  showErrors,
  onIssueClick,
  t,
  compact = false,
}) {
  const slots = { ...emptyIntakeSlots(), ...(form.intakeSlots || {}) };
  const sections = buildIntakeSectionMeta(form, fieldErrors, showErrors);
  const errorCount = showErrors ? intakeErrorCount(fieldErrors) : 0;
  const ready = errorCount === 0 && sections.requirements.complete && sections.information.complete && sections.team.complete && sections.analysis.complete;

  const modeLabel =
    form.analysisMode === 'ai'
      ? t('adminTasks.intakeModeAiTitle') || 'AI-assisted'
      : form.analysisMode === 'manual'
        ? t('adminTasks.wizardModeManual') || 'Manual'
        : t('adminTasks.intakeNotSelected') || 'Chưa chọn';

  const panel = (
    <div className={intakeUi.summaryPanel}>
      <p className={intakeUi.summaryLabel}>
        {t('adminTasks.intakeSummaryTitle') || 'Project summary'}
      </p>

      <div className={compact ? 'mt-3 space-y-3' : 'mt-4 space-y-4'}>
        <div>
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeSummaryProject') || 'Project'}</p>
          <p className={intakeUi.summaryRow}>{form.title?.trim() || '—'}</p>
        </div>
        {form.customerName ? (
          <div>
            <p className="text-xs text-muted-foreground">
              {t('adminTasks.wizardCustomerName') || 'Customer'}
            </p>
            <p className={intakeUi.summaryRow}>{form.customerName}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryAnalysis') || 'Analysis'}
          </p>
          <p className={intakeUi.summaryRow}>{modeLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSectionTeam') || 'Core team'}
          </p>
          <ul className="mt-1 space-y-1">
            {INTAKE_LEAD_ROLE_KEYS.map((key) => {
              const ok = intakeSlotFilled(slots, key);
              const slot = slots[key];
              return (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {ok ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{t(INTAKE_LEAD_LABEL_KEYS[key])}</span>
                  {ok && slot?.displayName ? (
                    <span className="truncate text-foreground">· {slot.displayName}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryRequirement') || 'Requirement source'}
          </p>
          <p className={intakeUi.summaryRow}>
            {form.intakeFiles?.requirement?.name ||
              t('adminTasks.intakeNoneYet') ||
              'Chưa có'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeSummaryPhase') || 'Phase'}</p>
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
            {t('adminTasks.intakeReadyToCreate') || 'Sẵn sàng tạo dự án nháp'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('adminTasks.intakeSummaryHint') ||
              'Hoàn tất các mục bên trái — checklist cập nhật theo thời gian thực.'}
          </p>
        )}
        {!compact ? (
          <ul className={`${intakeUi.summaryChecklist} mt-3`}>
            <ChecklistRow
              ok={sections.requirements.complete}
              label={t('adminTasks.intakeCheckRequirement') || 'Requirement file'}
            />
            <ChecklistRow
              ok={sections.information.complete}
              label={t('adminTasks.intakeCheckIdentity') || 'Project identity'}
            />
            <ChecklistRow
              ok={sections.team.complete}
              label={t('adminTasks.intakeCheckTeam') || 'Core team'}
            />
            <ChecklistRow
              ok={sections.analysis.complete}
              label={t('adminTasks.intakeCheckAnalysis') || 'Analysis method'}
            />
          </ul>
        ) : null}
      </div>
    </div>
  );

  return panel;
}
