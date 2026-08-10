import { ChevronRight, Info } from 'lucide-react';
import {
  PROJECT_WORK_TYPES,
  PROJECT_HUB_VIEW_OPTIONS,
  PROJECT_WORKFLOW_CARDS,
  resolveWorkflowCard,
} from './projectWizardConstants';
import { wizardUi } from './projectWizardUi';

function SetupRow({ title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick} className={wizardUi.rowCard}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function ProjectWizardStepSetup({
  form,
  patchForm,
  setupPanel,
  setSetupPanel,
  t,
}) {
  const card = resolveWorkflowCard(form.workflowCardId);
  const workTypeSummary = PROJECT_WORK_TYPES.filter((wt) => form.workTypes?.[wt.id])
    .map((wt) => t(wt.labelKey) || wt.labelFallback)
    .join(', ');
  const viewSummary = PROJECT_HUB_VIEW_OPTIONS.filter((v) => form.enabledViews?.[v.id])
    .map((v) => t(v.labelKey) || v.labelFallback)
    .join(', ');

  if (setupPanel === 'workTypes') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          {t('adminTasks.wizardWorkTypesTitle') || 'Work types'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('adminTasks.wizardWorkTypesHint') || 'Chọn loại công việc dùng trong dự án.'}
        </p>
        <ul className="space-y-2">
          {PROJECT_WORK_TYPES.map((wt) => (
            <li key={wt.id}>
              <label className={wizardUi.checkRow}>
                <input
                  type="checkbox"
                  checked={Boolean(form.workTypes?.[wt.id])}
                  onChange={(e) =>
                    patchForm({
                      workTypes: { ...form.workTypes, [wt.id]: e.target.checked },
                    })
                  }
                />
                <span className="text-sm text-foreground">
                  {t(wt.labelKey) || wt.labelFallback}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (setupPanel === 'statuses') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          {t('adminTasks.wizardStatusesTitle') || 'Statuses'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('adminTasks.wizardStatusesHint') ||
            'Chọn Agile, Scrum hoặc Kanban — cột board cập nhật ở preview.'}
        </p>
        <div className="grid gap-3">
          {PROJECT_WORKFLOW_CARDS.map((c) => {
            const active = form.workflowCardId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => patchForm({ workflowCardId: c.id })}
                className={active ? wizardUi.statusCardActive : wizardUi.statusCard}
              >
                <div className="text-sm font-semibold text-foreground">
                  {t(c.labelKey) || c.labelFallback}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(c.descriptionKey) || c.descriptionFallback}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {(c.columns || []).join(' → ')}
                </p>
              </button>
            );
          })}
        </div>
        {form.workflowCardId === 'scrum' ? (
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs text-muted-foreground">
              {t('adminTasks.wizardSprintDays')}
            </span>
            <input
              type="number"
              min={1}
              max={60}
              className={wizardUi.input}
              value={form.sprintDurationDays}
              onChange={(e) => patchForm({ sprintDurationDays: e.target.value })}
            />
          </label>
        ) : null}
        {form.workflowCardId === 'kanban' ? (
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs text-muted-foreground">
              {t('adminTasks.wizardWipLimit')}
            </span>
            <input
              type="number"
              min={0}
              className={wizardUi.input}
              value={form.wipLimit}
              onChange={(e) => patchForm({ wipLimit: e.target.value })}
            />
          </label>
        ) : null}
      </div>
    );
  }

  if (setupPanel === 'views') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          {t('adminTasks.wizardViewsTitle') || 'Views'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('adminTasks.wizardViewsHint') ||
            'Bật tab Project Hub (Overview, Planning, Board…). Có thể đổi sau trong Settings.'}
        </p>
        <ul className="space-y-2">
          {PROJECT_HUB_VIEW_OPTIONS.map((v) => (
            <li key={v.id}>
              <label className={wizardUi.checkRow}>
                <input
                  type="checkbox"
                  checked={Boolean(form.enabledViews?.[v.id])}
                  onChange={(e) =>
                    patchForm({
                      enabledViews: { ...form.enabledViews, [v.id]: e.target.checked },
                    })
                  }
                />
                <span className="text-sm text-foreground">
                  {t(v.labelKey) || v.labelFallback}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardSetupTitle') || "Let's set up your space"}
        </h1>
        <p className={wizardUi.subtitle}>
          {t('adminTasks.wizardSetupHint') ||
            'Work types, statuses và views là khối xây dựng — bạn có thể chỉnh lại sau.'}
        </p>
      </div>

      <div className="space-y-2.5">
        <SetupRow
          title={t('adminTasks.wizardWorkTypesTitle') || 'Work types'}
          subtitle={workTypeSummary || 'Task, Bug, Story, Epic'}
          onClick={() => setSetupPanel('workTypes')}
        />
        <SetupRow
          title={t('adminTasks.wizardStatusesTitle') || 'Statuses'}
          subtitle={(card.columns || []).join(', ')}
          onClick={() => setSetupPanel('statuses')}
        />
        <SetupRow
          title={t('adminTasks.wizardViewsTitle') || 'Views'}
          subtitle={viewSummary || 'Overview, Planning, Board…'}
          onClick={() => setSetupPanel('views')}
        />
      </div>

      <label className={wizardUi.sampleRow}>
        <span className="flex items-center gap-2 text-sm text-foreground">
          {t('adminTasks.wizardSampleItems') || 'Start with sample work items'}
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <input
          type="checkbox"
          className="h-4 w-8 accent-sky-500"
          checked={Boolean(form.sampleWorkItems)}
          onChange={(e) => patchForm({ sampleWorkItems: e.target.checked })}
        />
      </label>
    </div>
  );
}
