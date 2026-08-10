import { PROJECT_WORKFLOW_CARDS } from './projectWizardConstants';

export default function ProjectWizardStepWorkflow({ form, patchForm, variant = 'collaborate', t }) {
  const isAdmin = variant === 'admin';
  const label = isAdmin
    ? 'mb-1 block text-xs font-medium text-muted-foreground'
    : 'mb-1 block text-xs font-medium text-white/70';
  const input = isAdmin
    ? 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none'
    : 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none';

  const selected = String(form.workflowCardId || 'kanban').toLowerCase();

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-base font-semibold ${isAdmin ? 'text-foreground' : 'text-white'}`}>
          {t('adminTasks.wizardStepWorkflow') || 'Workflow'}
        </h3>
        <p className={`mt-1 text-sm ${isAdmin ? 'text-muted-foreground' : 'text-white/60'}`}>
          {t('adminTasks.wizardStepWorkflowHint') || 'Chọn Agile, Scrum hoặc Kanban.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PROJECT_WORKFLOW_CARDS.map((card) => {
          const active = selected === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => patchForm({ workflowCardId: card.id })}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? isAdmin
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                    : 'border-[#5865F2] bg-[#5865F2]/20 ring-2 ring-[#5865F2]/50'
                  : isAdmin
                    ? 'border-border bg-card hover:bg-muted/30'
                    : 'border-white/15 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className={`text-sm font-semibold ${isAdmin ? 'text-foreground' : 'text-white'}`}>
                {t(card.labelKey) || card.labelFallback}
              </div>
              <p className={`mt-2 text-xs leading-relaxed ${isAdmin ? 'text-muted-foreground' : 'text-white/60'}`}>
                {t(card.descriptionKey) || card.descriptionFallback}
              </p>
            </button>
          );
        })}
      </div>

      {selected === 'scrum' ? (
        <label className="block max-w-xs">
          <span className={label}>{t('adminTasks.wizardSprintDays') || 'Sprint duration (days)'}</span>
          <input
            type="number"
            min={1}
            max={60}
            className={input}
            value={form.sprintDurationDays}
            onChange={(e) => patchForm({ sprintDurationDays: e.target.value })}
          />
        </label>
      ) : null}

      {selected === 'kanban' ? (
        <label className="block max-w-xs">
          <span className={label}>{t('adminTasks.wizardWipLimit') || 'WIP limit (0 = không giới hạn)'}</span>
          <input
            type="number"
            min={0}
            className={input}
            value={form.wipLimit}
            onChange={(e) => patchForm({ wipLimit: e.target.value })}
          />
        </label>
      ) : null}

      {selected === 'agile' ? (
        <p className={`text-xs ${isAdmin ? 'text-muted-foreground' : 'text-white/50'}`}>
          {t('adminTasks.wizardAgileNote') || 'Agile dùng cột tối giản; có thể gắn Scrum Master ở bước Team.'}
        </p>
      ) : null}
    </div>
  );
}
