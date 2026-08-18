import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import { assertCanStartSprint, countIssuesByStatusBucket, defaultSprintDateRange } from './projectHubUtils';

/**
 * Khối sprint: header Jira + drop-zone + + Create.
 */
export default function ProjectHubSprintSection({
  sprint,
  issues = [],
  lists = [],
  canManageSprints = false,
  canDeleteSprint = false,
  sprints = [],
  memberIdsBySprintId = null,
  allowedCreateTypes = [],
  depthById = null,
  hasBoardColumn = false,
  busy = false,
  collapsed = false,
  onToggleCollapse,
  onStart,
  onComplete,
  onEdit,
  onDeleteSprint,
  onCreateIssue,
  onOpenBoard,
  children,
  t,
  isDarkMode = false,
}) {
  const sprintId = String(sprint?._id || '');
  const dropId = `sprint:${sprintId}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { type: 'container', containerId: dropId, sprintId },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const status = String(sprint?.status || sprint?.state || 'planned').toLowerCase();
  const isClosedSprint = status === 'closed' || status === 'completed' || status === 'done';
  const isActiveSprint = status === 'active' || status === 'started' || status === 'in_progress';
  const canRemovePlannedSprint = Boolean(canDeleteSprint) && !isClosedSprint && !isActiveSprint;
  const counts = countIssuesByStatusBucket(issues, lists);
  const n = issues.length;
  const startCheck = assertCanStartSprint({
    sprint,
    sprints,
    issueCount: n,
    canManage: canManageSprints,
    memberIdsBySprintId,
  });
  const dates = defaultSprintDateRange(sprint);
  const canStart = startCheck.ok && !dates.error;

  const badge = (count, cls) => (
    <span className={`inline-flex min-w-[1.25rem] justify-center rounded px-1 py-0.5 text-[10px] font-bold ${cls}`}>
      {count}
    </span>
  );

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={
            collapsed ? t('workspace.projectHubBacklogExpandAria') : t('workspace.projectHubBacklogCollapseAria')
          }
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <h4 className="text-sm font-bold text-foreground">{sprint?.name}</h4>
        {canManageSprints ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary"
          >
            <Pencil size={11} aria-hidden />
            {sprint?.startDate || sprint?.endDate
              ? null
              : t('workspace.projectHubBacklogAddDates')}
          </button>
        ) : null}
        <span className="text-[11px] text-muted-foreground">
          ({t('workspace.projectHubBacklogWorkItems', { n })})
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {badge(counts.todo, 'bg-muted text-muted-foreground')}
          {badge(counts.progress, 'bg-primary/15 text-primary')}
          {badge(counts.done, 'bg-primary/25 text-primary')}
          {isActiveSprint && onOpenBoard ? (
            <button
              type="button"
              onClick={onOpenBoard}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
            >
              {t('workspace.projectHubPlanViewBoard')}
            </button>
          ) : null}
          {canManageSprints && !isActiveSprint && !isClosedSprint ? (
            <button
              type="button"
              disabled={!canStart || busy}
              title={
                !canStart && startCheck.errorKey ? t(startCheck.errorKey) : undefined
              }
              onClick={onStart}
              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t('workspace.projectHubPlanStartSprint')}
            </button>
          ) : null}
          {canManageSprints && isActiveSprint ? (
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
            >
              {t('workspace.projectHubPlanCompleteSprint')}
            </button>
          ) : null}
          {canRemovePlannedSprint ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDeleteSprint}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 size={12} aria-hidden />
              {t('workspace.projectHubBacklogDeleteSprint')}
            </button>
          ) : null}
          {canManageSprints || canRemovePlannedSprint ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('workspace.projectHubBacklogSprintMenuAria')}
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen ? (
                <div
                  className={`absolute right-0 z-[80] mt-1 min-w-[180px] rounded-lg border border-border py-1 shadow-xl ${
                    isDarkMode ? 'bg-background' : 'bg-surface'
                  }`}
                >
                  {canManageSprints ? (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit?.();
                      }}
                    >
                      {t('workspace.projectHubBacklogEditSprint')}
                    </button>
                  ) : null}
                  {canRemovePlannedSprint ? (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteSprint?.();
                      }}
                    >
                      {t('workspace.projectHubBacklogDeleteSprint')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {collapsed ? null : (
        <div
          ref={setNodeRef}
          className={`mx-2 mb-2 min-w-0 overflow-visible rounded-lg border ${
            isOver ? 'border-primary bg-primary/5' : n === 0 ? 'border-dashed border-border' : 'border-transparent'
          }`}
        >
          {n === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('workspace.projectHubBacklogDropHint')}
            </p>
          ) : (
            <div className="min-w-0">{children}</div>
          )}
          <div className="px-2 pb-2">
            <ProjectHubInlineCreateBar
              allowedTypes={allowedCreateTypes}
              depthById={depthById}
              hasBoardColumn={hasBoardColumn}
              busy={busy}
              onCreate={onCreateIssue}
              t={t}
            />
          </div>
        </div>
      )}
    </section>
  );
}
