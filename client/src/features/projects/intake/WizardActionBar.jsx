import { Check, Loader2 } from 'lucide-react';
import { intakeUi } from './intakeUi';

export default function WizardActionBar({
  ready,
  issueCount,
  onCancel,
  onCreate,
  busy,
  intakeBusy,
  createLabel,
  savingLabel,
  t,
}) {
  const disabled = busy || intakeBusy;

  return (
    <div className={intakeUi.actionBar}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          {ready ? (
            <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Check className="h-4 w-4 shrink-0" />
              {t('adminTasks.intakeReadyToCreate') || 'Sẵn sàng tạo dự án nháp'}
            </p>
          ) : issueCount > 0 ? (
            <p className="text-muted-foreground">
              {t('adminTasks.intakeIssuesCount', { n: issueCount }) ||
                `${issueCount} mục cần xử lý`}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t('adminTasks.intakeActionHint') ||
                'Điền đủ thông tin bắt buộc để tạo dự án nháp Phase 1.'}
            </p>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {onCancel ? (
            <button
              type="button"
              className={`${intakeUi.secondaryBtn} flex-1 sm:flex-none`}
              onClick={onCancel}
              disabled={disabled}
            >
              {t('common.cancel')}
            </button>
          ) : null}
          <button
            type="button"
            className={`${intakeUi.primaryBtn} inline-flex flex-1 items-center justify-center gap-2 sm:flex-none`}
            onClick={onCreate}
            disabled={disabled}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? savingLabel : createLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
