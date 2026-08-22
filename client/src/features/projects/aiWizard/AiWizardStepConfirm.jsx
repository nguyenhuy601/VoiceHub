import { wizardUi } from '../wizard/projectWizardUi';

/**
 * Step 4 — confirm title/description/dates then create project from pack.
 * Description/dates are display-only (create API maps from pack; title override only).
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
          <label className={wizardUi.fieldLabel}>{t('aiCreateWizard.fieldStart')}</label>
          <input className={wizardUi.input} value={confirmForm.startDate || '—'} readOnly />
        </div>
        <div>
          <label className={wizardUi.fieldLabel}>{t('aiCreateWizard.fieldDeadline')}</label>
          <input className={wizardUi.input} value={confirmForm.dueDate || '—'} readOnly />
        </div>
      </div>

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
