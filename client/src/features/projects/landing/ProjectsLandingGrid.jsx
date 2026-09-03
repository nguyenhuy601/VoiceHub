import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Hash,
  Lock,
  MessageCircle,
  Mic,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { displayDepartmentName } from '../../../utils/orgEntityDisplay';
import { FIGMA_WS_TEAM_CARD, FIGMA_WS_TEAM_GRID } from '../../../components/Organization/figmaOrganizationClasses';
import { paginateList } from './projectsLandingPagination';
import { isProjectActiveForUi, isProjectCompletedForUi } from './projectLandingActive';

const GRAD_PAIRS = [
  ['#1D4ED8', '#3B82F6'],
  ['#7C3AED', '#A78BFA'],
  ['#D97706', '#FBBF24'],
  ['#059669', '#34D399'],
  ['#DC2626', '#F87171'],
];

function pickGrad(seed) {
  const n = String(seed || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRAD_PAIRS[n % GRAD_PAIRS.length];
}

function buildProjectCards(projects = [], locale = 'vi') {
  return (Array.isArray(projects) ? projects : []).map((p, idx) => {
    const id = String(p?.projectId || p?._id || `project-${idx}`);
    const rawName = p?.title || p?.name || 'Project';
    const name = displayDepartmentName(rawName, locale);
    const initial = String(name).trim().charAt(0).toUpperCase() || 'P';
    const [gradStart, gradEnd] = pickGrad(id);
    const memberCount = Number(
      p?.memberCount ?? p?.membersCount ?? p?.totalMembers ?? 0
    );
    const relatedDeptCount = Array.isArray(p?.relatedDepartmentIds)
      ? p.relatedDepartmentIds.length
      : 0;
    return {
      id,
      name,
      description: p?.description || '',
      initial,
      gradStart,
      gradEnd,
      role: '',
      type: p?.visibility || 'private',
      members: Number.isFinite(memberCount) ? memberCount : 0,
      relatedDeptCount,
      informationLevel: p?.access?.informationLevel || '',
      isSummaryOnly: p?.access?.informationLevel === 'summary',
      avatars: [],
      online: 0,
      channels: [],
      unreadChat: 0,
      unreadTask: 0,
      activeTasks: 0,
      recentActivity: '',
      activityTime: '',
      raw: p,
      isProject: true,
      defaultBoardId: String(p?.defaultBoardId || p?.boards?.[0]?._id || ''),
      projectCode: p?.projectCode || '',
    };
  });
}

export default function ProjectsLandingGrid({
  organizationName = '',
  projects = [],
  assignedTasksCount = null,
  onCreateProject,
  onCreateProjectWithAi,
  createProjectDisabled = false,
  createProjectWithAiDisabled = false,
  onSelectProject,
  onModuleClick = null,
  onBack = null,
  departmentName = '',
  onCreateTeam,
  onSelectTeam,
}) {
  const { t, locale } = useAppStrings();
  const useProjects = true;

  const cards = useMemo(() => buildProjectCards(projects, locale), [projects, locale]);
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
  const totalOnline = cards.reduce((sum, card) => sum + Number(card.online || 0), 0);
  const teamMetricCount = 0;
  const resolvedAssignedTasks =
    assignedTasksCount != null
      ? Number(assignedTasksCount) || 0
      : cards.reduce((sum, card) => sum + Number(card.activeTasks || 0), 0);
  const orgInitial = String(organizationName || 'VoiceHub').trim().charAt(0).toUpperCase() || 'V';

  const emptyLabel = useProjects
    ? t('workspace.noProjectsYet')
    : t('workspace.noTeamsInDepartment');
  const createFirstLabel = useProjects
    ? t('workspace.createFirstProject')
    : t('workspace.createFirstTeam');
  const createAction = useProjects ? onCreateProject : onCreateTeam;

  const renderCard = (card) => (
    <div
      key={card.id}
      role="button"
      tabIndex={0}
      onClick={() =>
        card.isProject ? onSelectProject?.(card.raw, card.id) : onSelectTeam?.(card.raw, card.id)
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter')
          card.isProject ? onSelectProject?.(card.raw, card.id) : onSelectTeam?.(card.raw, card.id);
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
              {card.role ? (
                <span className="mt-1 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary">
                  {card.role}
                </span>
              ) : null}
            </div>
            <ChevronRight size={14} className="shrink-0 text-muted-foreground transition group-hover:text-primary" />
          </div>
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {card.avatars.length > 0 ? (
          <span className="flex -space-x-2">
            {card.avatars.map((avatar) => (
              <span
                key={avatar.id}
                title={avatar.name}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-[0.55rem] font-bold"
                style={{ background: `${avatar.color}18`, color: avatar.color }}
              >
                {avatar.initials}
              </span>
            ))}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <Users size={11} />
          {card.members} {t('workspace.members')}
        </span>
        {card.relatedDeptCount > 0 ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {t('workspace.projectHubRelatedDeptsCount').replace('{n}', String(card.relatedDeptCount))}
          </span>
        ) : null}
        {card.isSummaryOnly ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
            Summary
          </span>
        ) : null}
        {card.online > 0 ? (
          <span className="flex items-center gap-1 font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {card.online} {t('workspace.online')}
          </span>
        ) : null}
        {card.activeTasks > 0 ? (
          <span className="ml-auto flex items-center gap-1">
            <ClipboardList size={11} />
            {card.activeTasks} {t('workspace.tasks')}
          </span>
        ) : null}
      </div>

      {card.channels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {card.channels.map((ch, chIdx) => (
            <span
              key={`${card.id}-ch-${chIdx}-${ch}`}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground"
            >
              <Hash size={9} />
              {ch.replace(/^#/, '')}
            </span>
          ))}
        </div>
      ) : null}

      {card.recentActivity ? (
        <p className="truncate rounded-lg border border-border bg-background px-2.5 py-2 text-[0.6875rem] text-muted-foreground">
          {card.recentActivity}
          {card.activityTime ? ` · ${card.activityTime}` : ''}
        </p>
      ) : null}

      {onModuleClick ? (
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { module: 'chat', icon: MessageCircle, label: t('workspace.moduleChat'), badge: card.unreadChat, color: 'text-primary' },
            { module: 'voice', icon: Mic, label: t('workspace.moduleVoice'), badge: 0, color: 'text-success' },
            { module: 'tasks', icon: ClipboardList, label: t('workspace.moduleTask'), badge: card.unreadTask, color: 'text-warning' },
            { module: 'documents', icon: FileText, label: t('workspace.moduleDocs'), badge: 0, color: 'text-violet-500 dark:text-violet-400' },
          ].map((btn) => (
            <button
              key={btn.module}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onModuleClick(card.id, btn.module, card.raw, {
                  isProject: Boolean(card.isProject),
                });
              }}
              className="relative flex flex-col items-center justify-center gap-1 rounded-[10px] bg-muted px-1.5 py-2.5 text-[0.6875rem] font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-sm"
            >
              {btn.badge > 0 ? (
                <span className="absolute right-1.5 top-1 min-w-[15px] rounded-full bg-primary px-1 text-[0.5rem] font-bold text-primary-foreground">
                  {btn.badge}
                </span>
              ) : null}
              <btn.icon size={15} className={btn.color} />
              {btn.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

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
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                aria-label={t('workspace.backToDepartments')}
              >
                <ChevronLeft size={20} />
              </button>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-md">
                {useProjects ? <Briefcase size={18} aria-hidden /> : orgInitial}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-bold text-foreground">
                {departmentName ||
                  (useProjects ? t('workspace.projectsPageTitle') : organizationName || t('workspace.organization'))}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {departmentName
                  ? t('workspace.teamHubSubtitle', {
                      org: organizationName || t('workspace.organization'),
                      teams: teamMetricCount,
                      online: totalOnline,
                    })
                  : useProjects
                    ? t('workspace.projectsPageSubtitle', {
                        org: organizationName || t('workspace.organization'),
                        count: activeCards.length,
                      })
                    : t('workspace.orgSubtitle', { teams: teamMetricCount, online: totalOnline })}
                {!useProjects && resolvedAssignedTasks > 0
                  ? t('workspace.orgSubtitleTasks', { tasks: resolvedAssignedTasks })
                  : ''}
              </p>
            </div>
          </div>
          {(onCreateProjectWithAi || createAction) ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {onCreateProjectWithAi ? (
                <button
                  type="button"
                  onClick={onCreateProjectWithAi}
                  disabled={createProjectWithAiDisabled}
                  aria-busy={createProjectWithAiDisabled || undefined}
                  aria-label={t('workspace.createProjectWithAi')}
                  title={t('workspace.createProjectWithAi')}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Sparkles size={16} />
                </button>
              ) : null}
              {createAction ? (
                <button
                  type="button"
                  onClick={createAction}
                  disabled={useProjects ? createProjectDisabled : false}
                  aria-busy={(useProjects && createProjectDisabled) || undefined}
                  aria-label={createFirstLabel}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus size={18} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="px-6 py-6">
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
