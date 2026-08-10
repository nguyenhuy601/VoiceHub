import { wizardUi } from './projectWizardUi';

/**
 * Live mock preview — phản ánh title + status columns + enabled view tabs.
 * Colors follow ThemeContext via semantic tokens.
 */
export default function ProjectWizardPreview({
  title = '',
  projectCode = '',
  columns = [],
  enabledViews = {},
  workTypes = {},
  t,
}) {
  const code =
    String(projectCode || title || 'HKT')
      .trim()
      .slice(0, 4)
      .toUpperCase() || 'HKT';
  const displayTitle = String(title || '').trim() || code;
  const cols = columns.length ? columns : ['To Do', 'In Progress', 'Done'];

  const tabOrder = ['overview', 'planning', 'board', 'members', 'files', 'activity'];
  const tabs = tabOrder.filter((id) => enabledViews?.[id] !== false || id === 'board');
  const showTabs = tabs.length ? tabs : ['board'];

  const sampleTypes = Object.entries(workTypes || {})
    .filter(([k, on]) => on && ['task', 'bug', 'story'].includes(k))
    .map(([k]) => k);
  const cards = (sampleTypes.length ? sampleTypes : ['task', 'bug']).slice(0, 3).map((type, i) => ({
    key: `${code}-${i + 2}`,
    type,
  }));

  const tabLabel = (id) => {
    const map = {
      overview: 'Summary',
      planning: 'Backlog',
      board: 'Board',
      members: 'Team',
      files: 'Files',
      activity: 'Activity',
    };
    return map[id] || id;
  };

  return (
    <div className={wizardUi.previewBoard}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t('adminTasks.wizardPreviewBadge') || 'Team-managed space'}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{displayTitle}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {showTabs.map((id) => (
            <span
              key={id}
              className={`rounded-md px-2 py-1 text-[11px] ${
                id === 'board'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              {tabLabel(id)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 gap-2 overflow-x-auto p-3">
        {cols.map((col, colIdx) => (
          <div key={col} className={wizardUi.previewCol}>
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {col}
            </div>
            <div className="space-y-2">
              {colIdx === 0
                ? cards.map((c) => (
                    <div key={c.key} className={wizardUi.previewCard}>
                      <div className="text-[10px] text-muted-foreground">{c.key}</div>
                      <div className="mt-1 text-xs capitalize text-foreground">{c.type}</div>
                    </div>
                  ))
                : colIdx === 1 && cards[0] ? (
                    <div className={`${wizardUi.previewCard} opacity-80`}>
                      <div className="text-[10px] text-muted-foreground">{code}-1</div>
                      <div className="mt-1 text-xs text-foreground">In flight</div>
                    </div>
                  ) : (
                    <div className="h-8 rounded-md border border-dashed border-border" />
                  )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
