import { wizardUi } from './projectWizardUi';
import { deliveryPhaseLabelKey } from '../../../utils/projectPhaseNav';

/** Step Confirm — Phase 1 intake summary. */
export default function ProjectWizardStepConfirm({ form, t, creatorUserId }) {
  const members = Array.isArray(form.seedMembers) ? form.seedMembers : [];
  const phaseLabel = t(deliveryPhaseLabelKey('requirement_analysis'));

  return (
    <div className="space-y-5">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardConfirmTitle') || 'Xác nhận tạo dự án'}
        </h1>
        <p className={wizardUi.subtitle}>
          {t('adminTasks.wizardConfirmHint') ||
            'Dự án sẽ mở ở Phase 1 — Requirement Analysis. Sau khi artifact được approve đủ, bạn có thể chuyển Phase 2 (thủ công hoặc AI SRS).'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {phaseLabel}
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">
            {form.category || 'internal'}
          </span>
          <span className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">
            {form.priority || 'medium'}
          </span>
        </div>
        <p className="text-base font-semibold text-foreground">{form.title || '—'}</p>
        {form.projectCode ? (
          <p className="font-mono text-xs text-muted-foreground">{form.projectCode}</p>
        ) : null}
        {form.description ? (
          <p className="text-muted-foreground whitespace-pre-wrap">{form.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t('adminTasks.wizardConfirmRoster') || 'Thành viên seed'}: {members.length}
          {creatorUserId
            ? ` (+ ${t('adminTasks.wizardConfirmYouArePo') || 'bạn = PO'})`
            : ''}
        </p>
      </div>
    </div>
  );
}
