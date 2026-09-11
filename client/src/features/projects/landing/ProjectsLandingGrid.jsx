import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { FIGMA_WS_TEAM_CARD, FIGMA_WS_TEAM_GRID } from '../../../components/Organization/figmaOrganizationClasses';
import { paginateList } from './projectsLandingPagination';
import { isProjectActiveForUi, isProjectCompletedForUi } from './projectLandingActive';
import { buildProjectLandingCards } from './projectLandingCardModel';

export default function ProjectsLandingGrid({
  projects = [],
  onCreateProject,
  onCreateProjectWithAi,
  createProjectDisabled = false,
  createProjectWithAiDisabled = false,
  onSelectProject,
  onCreateTeam,
  onSelectTeam,
}) {
  const { t, locale } = useAppStrings();
  const useProjects = true;

  const cards = useMemo(() => buildProjectLandingCards(projects, locale), [projects, locale]);
  const activeCards = useMemo(() => cards.filter((card) => isProjectActiveForUi(card.raw)), [cards]);
  const [activePage, setActivePage] = useState(1);

  const pagedActive = useMemo(
    () => paginateList(activeCards, activePage),
    [activeCards, activePage]
  );

  useEffect(() => {
    setActivePage(1);
  }, [activeCards.length]);

  useEffect(() => {
    if (activePage !== pagedActive.page) setActivePage(pagedActive.page);
  }, [activePage, pagedActive.page]);

  const emptyLabel = useProjects
    ? t('workspace.noProjectsYet')
    : t('workspace.noTeamsInDepartment');
  const createFirstLabel = useProjects
    ? t('workspace.createFirstProject')
    : t('workspace.createFirstTeam');
  const createAction = useProjects ? onCreateProject : onCreateTeam;

  const renderCard = (card) => {
    const phaseLabel = card.statusLabelKey ? t(card.statusLabelKey) : '';
    const healthLabel = card.healthLabelKey ? t(card.healthLabelKey) : '';
    const priorityLabel = card.priorityLabelKey ? t(card.priorityLabelKey) : '';
    const progressPct = card.progressPercent;
    const showProgress = progressPct != null;

    return (
      <div
        key={card.id}
        role="button"
        tabIndex={0}
        onClick={() =>
          card.isProject ? onSelectProject?.(card.raw, card.id) : onSelectTeam?.(card.raw, card.id)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter')
            card.isProject
              ? onSelectProject?.(card.raw, card.id)
              : onSelectTeam?.(card.raw, card.id);
        }}
        className={`${FIGMA_WS_TEAM_CARD} group`}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-sm font-extrabold text-white shadow-md"
            style={{
              background: `linear-gradient(135deg, ${card.gradStart}, ${card.gradEnd})`,
              boxShadow: `0 4px 14px ${card.gradStart}44`,
            }}
          >
            {card.initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3 className="truncate text-base font-bold text-foreground">{card.name}</h3>
                  {card.isProject && isProjectCompletedForUi(card.raw) ? (
                    <span className="shrink-0 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-success">
                      {t('workspace.projectHubCompleteProjectBadge')}
                    </span>
                  ) : null}
                  {String(card.type).toLowerCase() === 'public' ? null : (
                    <Lock size={12} className="shrink-0 text-muted-foreground/50" />
                  )}
                </div>
                {card.projectCode ? (
                  <p className="mt-0.5 truncate text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">
                    {card.projectCode}
                  </p>
                ) : null}
              </div>
              <ChevronRight
                size={14}
                className="mt-1 shrink-0 text-muted-foreground transition group-hover:text-primary"
              />
            </div>
            {card.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
            ) : null}
          </div>
        </div>

        {(phaseLabel || showProgress) && (
          <div className="mt-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              {phaseLabel ? (
                <span className="font-semibold text-foreground">{phaseLabel}</span>
              ) : (
                <span />
              )}
              {showProgress ? (
                <span
                  className="shrink-0 tabular-nums font-bold text-foreground"
                  aria-label={t('workspace.projectLandingProgressAria', { pct: progressPct })}
                >
                  {progressPct}%
                </span>
              ) : null}
            </div>
            {showProgress ? (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-1 flex flex-col gap-1.5 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {healthLabel ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${card.healthDotClass}`}
                  aria-hidden
                />
                {healthLabel}
              </span>
            ) : null}
            {card.deadlineLabel ? (
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden />
                {card.deadlineLabel}
              </span>
            ) : null}
            {card.hasPm ? (
              <span className="inline-flex items-center gap-1">
                <UserRound size={11} aria-hidden />
                {t('workspace.projectLandingPm', {
                  name: card.pmDisplayName || '—',
                })}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Users size={11} aria-hidden />
              {card.members} {t('workspace.members')}
            </span>
            {priorityLabel ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Zap size={11} aria-hidden />
                {priorityLabel}
              </span>
            ) : null}
            {card.relatedDeptCount > 0 ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {t('workspace.projectHubRelatedDeptsCount').replace(
                  '{n}',
                  String(card.relatedDeptCount)
                )}
              </span>
            ) : null}
            {card.isSummaryOnly ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                {t('workspace.projectHubSummaryOnlyBadge')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderProjectsPager = (paged, setPage, prevLabel, nextLabel, pageLabel) =>
    paged.showPager ? (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <button
          type="button"
          disabled={paged.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={prevLabel}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          {prevLabel}
        </button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {pageLabel}
        </span>
        <button
          type="button"
          disabled={paged.page >= paged.totalPages}
          onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label={nextLabel}
        >
          {nextLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    ) : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background/75 backdrop-blur-sm dark:bg-background/65"
      aria-label={t('workspace.projectsLandingAria')}
    >
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {activeCards.length === 0 ? (
          <div
            className="mb-4 flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center"
            role="status"
          >
            {useProjects ? (
              <Briefcase size={40} className="mb-4 text-muted-foreground/50" aria-hidden />
            ) : (
              <Users size={40} className="mb-4 text-muted-foreground/50" aria-hidden />
            )}
            <p className="text-sm font-semibold text-foreground">{emptyLabel}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {createAction ? (
                <button
                  type="button"
                  onClick={createAction}
                  disabled={useProjects ? createProjectDisabled : false}
                  aria-busy={(useProjects && createProjectDisabled) || undefined}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus size={16} />
                  {createFirstLabel}
                </button>
              ) : null}
              {onCreateProjectWithAi ? (
                <button
                  type="button"
                  onClick={onCreateProjectWithAi}
                  disabled={createProjectWithAiDisabled}
                  aria-busy={createProjectWithAiDisabled || undefined}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {t('workspace.createProjectWithAi')}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="mb-3 text-sm font-bold text-foreground">{t('workspace.activeProjects')}</div>
            <div className={FIGMA_WS_TEAM_GRID}>
              {pagedActive.items.map((card) => renderCard(card))}
            </div>
            {renderProjectsPager(
              pagedActive,
              setActivePage,
              t('workspace.projectsLandingPrev'),
              t('workspace.projectsLandingNext'),
              t('workspace.projectsLandingPage', {
                page: pagedActive.page,
                total: pagedActive.totalPages,
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
