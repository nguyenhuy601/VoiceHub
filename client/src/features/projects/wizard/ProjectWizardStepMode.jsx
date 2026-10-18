import { wizardUi } from './projectWizardUi';

/** Analysis Mode — Manual vs AI (section trên trang intake). */
export default function ProjectWizardStepMode({ form, patchForm, t }) {
  const mode = form.analysisMode === 'ai' ? 'ai' : form.analysisMode === 'manual' ? 'manual' : '';

  const options = [
    {
      id: 'manual',
      title: t('adminTasks.wizardModeManual'),
      hint:
        t('adminTasks.wizardModeManualHint'),
    },
    {
      id: 'ai',
      title: t('adminTasks.wizardModeAi'),
      hint:
        t('adminTasks.wizardModeAiHint'),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('adminTasks.wizardModeTitle')}
          <span className="ml-0.5 text-destructive">*</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('adminTasks.wizardModeHint')}
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label={t('adminTasks.wizardModeTitle')}>
        {options.map((opt) => {
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => patchForm({ analysisMode: opt.id })}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border bg-surface/60 hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{opt.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
