import { wizardUi } from '../wizard/projectWizardUi';
import { isProjectDateRangeInvalid } from '../hub/projectHubUtils';

/**
 * Step 4 — confirm title/dates then create project from pack.
 * Description stays display-only (from pack objective).
 */
export default function AiWizardStepConfirm({
  confirmForm,
  patchConfirmForm,
  pack,
  t,
}) {
  const overview = pack?.overview || {};
  const staffing = pack?.staffingPlan || {};
  const roles = Array.isArray(staffing.requiredRoles) ? staffing.requiredRoles : [];
  const datesInvalid = isProjectDateRangeInvalid(confirmForm.startDate, confirmForm.dueDate);

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.confirmTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.confirmSubtitle')}</p>
      </div>

      <div>
        <label className={wizardUi.fieldLabel} htmlFor="ai-wizard-title">
          {t('aiCreateWizard.fieldTitle')}
        </label>
        <input
          id="ai-wizard-title"
          className={wizardUi.input}
          value={confirmForm.title}
          onChange={(e) => patchConfirmForm({ title: e.target.value })}
          placeholder={t('aiCreateWizard.fieldTitlePlaceholder')}
        />
      </div>

      <div>
        <label className={wizardUi.fieldLabel} htmlFor="ai-wizard-desc">
          {t('aiCreateWizard.fieldDescription')}
        </label>
        <textarea
          id="ai-wizard-desc"
          className={wizardUi.textarea}
          value={confirmForm.description}
          readOnly
          rows={4}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('aiCreateWizard.descriptionFromPack')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={wizardUi.fieldLabel} htmlFor="ai-wizard-start">
            {t('aiCreateWizard.fieldStart')}
          </label>
          <input
            id="ai-wizard-start"
            type="date"
            className={wizardUi.input}
            value={confirmForm.startDate || ''}
            onChange={(e) => patchConfirmForm({ startDate: e.target.value })}
          />
        </div>
        <div>
          <label className={wizardUi.fieldLabel} htmlFor="ai-wizard-deadline">
            {t('aiCreateWizard.fieldDeadline')}
          </label>
          <input
            id="ai-wizard-deadline"
            type="date"
            className={wizardUi.input}
            value={confirmForm.dueDate || ''}
            onChange={(e) => patchConfirmForm({ dueDate: e.target.value })}
          />
        </div>
      </div>
      {datesInvalid ? (
        <p className="text-sm text-destructive" role="alert">
          {t('aiCreateWizard.dateRangeInvalid')}
        </p>
      ) : null}

      {(overview.priority || roles.length > 0) && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {overview.priority ? (
            <p>
              {t('aiCreateWizard.priorityLabel')}: {overview.priority}
            </p>
          ) : null}
          {roles.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {roles.map((r) => (
                <li key={r.roleKey || r.key}>
                  {(r.roleKey || r.key) + (r.count != null ? ` ×${r.count}` : '')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('aiCreateWizard.assignLaterHint')}</p>
    </div>
  );
}
