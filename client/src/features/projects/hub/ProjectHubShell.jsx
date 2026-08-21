import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, FileText, LayoutGrid, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { isProjectCompletedStatus, resolveHubCapabilities } from './hubCaps';
import ProjectHubMembersPanel from './ProjectHubMembersPanel';
import ProjectHubSettingsPanel from './ProjectHubSettingsPanel';
import ProjectHubPlanningPanel from './ProjectHubPlanningPanel';
import ProjectHubListPanel from './ProjectHubListPanel';
import ProjectHubTimelinePanel from './ProjectHubTimelinePanel';
import ProjectHubChangeRequestsPanel from './ProjectHubChangeRequestsPanel';
import WorkItemDetail from './WorkItemDetail';
import ProjectChatWorkspace from '../chat/ProjectChatWorkspace';
import ProjectHubCompleteSprintModal from './ProjectHubCompleteSprintModal';
import ProjectHubCompleteProjectModal from './ProjectHubCompleteProjectModal';
import ProjectHubOverviewCharts from './ProjectHubOverviewCharts';
import { isBoardSprintReady } from './projectHubHierarchy';
import { isProjectChatTabEnabled } from '../../../utils/suitePathUtils';
import {
  PROJECT_HUB_TABS,
  buildOverviewDashboardCharts,
  collectCardActivity,
  collectCardAttachments,
  computeHubBoardSummary,
  countCardsByIssueType,
  countCardsInSprint,
  countPlanningByType,
  countUnassignedOpenCards,
  formatHubDate,
  formatHubMethodology,
  formatHubProjectStatus,
  hubAttentionState,
  listHubHealthCards,
  normalizeIssueType,
  mapHubActivityItem,
  pickNextHubActions,
  projectInitials,
  resolveViewerActiveSprint,
  sumOpenCardEstimateHours,
  unwrapPlanningList,
} from './projectHubUtils';

function OverviewMetricSkeleton({ count = 4, isDarkMode }) {
  const pulse = isDarkMode ? 'bg-white/10' : 'bg-muted';
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`h-[4.25rem] animate-pulse rounded-lg motion-reduce:animate-none ${pulse}`}
          aria-hidden
        />
      ))}
    </div>
  );
}

function OverviewContextSkeleton({ isDarkMode }) {
  const pulse = isDarkMode ? 'bg-white/10' : 'bg-muted';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-56 animate-pulse rounded-xl motion-reduce:animate-none ${
              i === 2 ? 'sm:col-span-2 lg:col-span-1' : ''
            } ${pulse}`}
            aria-hidden
          />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {[0, 1].map((i) => (
          <div key={i} className={`h-40 animate-pulse rounded-xl motion-reduce:animate-none ${pulse}`} aria-hidden />
        ))}
      </div>
    </div>
  );
}

function overviewIssueTypeLabel(type, t) {
  const raw = String(type || '').toLowerCase();
  if (raw === 'feature') return t('workspace.projectHubIssueTypeFeature');
  if (raw === 'subtask') return t('workspace.projectHubIssueTypeSubtask');
  const key = normalizeIssueType(type);
  if (key === 'story') return t('workspace.projectHubIssueTypeStory');
  if (key === 'bug') return t('workspace.projectHubIssueTypeBug');
  if (key === 'epic') return t('workspace.projectHubIssueTypeEpic');
  return t('workspace.projectHubIssueTypeTask');
}

function overviewActionStatusLabel(action, t) {
  if (action?.statusLabel) return action.statusLabel;
  const raw = String(action?.statusKey || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return '';
  const key = `workspace.projectHubWorkStatus_${raw}`;
  const label = t(key);
  return label === key ? action.statusKey : label;
}

function overviewSprintStatusLabel(sprint, t) {
  const s = String(sprint?.status || 'planned').toLowerCase();
  const key = `workspace.projectHubPlanningStatus_${s}`;
  const label = t(key);
  return label === key ? s : label;
}

/** Tooltip tên hạng mục khi hover/focus KPI hoặc banner Attention. */
function OverviewHealthTip({ items = [], totalCount = 0, heading, moreLabel, children, className = '' }) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const hasItems = items.length > 0;
  const hiddenMore = Math.max(0, Number(totalCount) - items.length);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => hasItems && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => hasItems && setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      {typeof children === 'function' ? children({ tipId, open, hasItems }) : children}
      {open && hasItems ? (
        <div
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-2 text-left shadow-md"
        >
          {heading ? (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {heading}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {items.map((row) => (
              <li key={row.id || row.title} className="truncate text-xs font-medium text-foreground">
                {row.title}
              </li>
            ))}
          </ul>
          {hiddenMore > 0 && moreLabel ? (
            <p className="mt-1 text-[10px] text-muted-foreground">{moreLabel}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OverviewPanel({
  board,
  projectStatus = '',
  summary,
  deliveryExtras = { unassigned: 0, estimateHours: 0 },
  dashboardCharts = null,
  nextActions = [],
  overdueCards = [],
  inReviewCards = [],
  overviewCards = [],
  overviewLists = [],
  overviewMembers = [],
  activity,
  activityLoading = false,
  activityError = false,
  onRetryActivity,
  activeSprint = null,
  sprintIssueCount = 0,
  planningPulse = { epic: 0, feature: 0 },
  boardLoading = false,
  sprintContextLoading = false,
  planningContextLoading = false,
  locale,
  isDarkMode,
  onOpenBoard,
  onOpenBacklog,
  onOpenNextAction,
  onViewAllActivity,
  t,
}) {
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const cardCls = 'rounded-xl border border-border bg-surface p-4';
  const statusLabel = formatHubProjectStatus(projectStatus, t);
  const attention = hubAttentionState({ overdue: summary.overdue });
  const reviewPercent = summary.total
    ? Math.round(((Number(summary.inReview) || 0) / Number(summary.total)) * 100)
    : 0;
  const estimateLabel =
    Number(deliveryExtras.estimateHours) % 1 === 0
      ? String(deliveryExtras.estimateHours)
      : Number(deliveryExtras.estimateHours).toFixed(1);
  // Unassigned chỉ hiện ở assignee donut — không tile trùng dưới KPI.
  const extrasTiles =
    Number(deliveryExtras.estimateHours) > 0
      ? [[estimateLabel, t('workspace.projectHubStatEstimateTotal')]]
      : [];

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <header className={`mb-4 rounded-xl border border-border bg-surface p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className={`text-base font-bold leading-tight ${titleCls}`}>
              {board?.title || t('workspace.projectHubUntitled')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {board?.projectCode ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {board.projectCode}
                </span>
              ) : null}
              {board?.methodology ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatHubMethodology(board.methodology, t)}
                </span>
              ) : null}
              {statusLabel ? (
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <p className={`mt-2 flex flex-wrap items-center gap-1 text-xs ${muted}`}>
              <Calendar size={12} className="shrink-0" aria-hidden />
              <span>
                {t('workspace.projectHubFieldDue')}: {formatHubDate(board?.dueDate, locale)}
              </span>
            </p>
            <p className={`mt-1 text-xs ${muted}`}>{t('workspace.projectHubOverviewHint')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenBacklog}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              {t('workspace.projectHubOpenBacklog')}
            </button>
            <button
              type="button"
              onClick={onOpenBoard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <LayoutGrid size={14} aria-hidden />
              {t('workspace.projectHubOpenBoard')}
            </button>
          </div>
        </div>
      </header>

      <section className={cardCls} aria-labelledby="overview-project-health">
        <h3
          id="overview-project-health"
          className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
        >
          {t('workspace.projectHubProjectHealth')}
        </h3>
        {boardLoading ? (
          <OverviewMetricSkeleton count={4} isDarkMode={isDarkMode} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                {
                  key: 'total',
                  value: String(summary.total),
                  label: t('workspace.projectHubStatCards'),
                  extra: '',
                  tone: '',
                  tipItems: null,
                  tipTotal: 0,
                  tipHeading: '',
                },
                {
                  key: 'done',
                  value: `${summary.donePercent}%`,
                  label: t('workspace.projectHubStatDone'),
                  extra:
                    summary.total > 0
                      ? t('workspace.projectHubStatDoneSub', { n: summary.done || 0 })
                      : '',
                  tone: summary.donePercent >= 80 ? 'success' : '',
                  tipItems: null,
                  tipTotal: 0,
                  tipHeading: '',
                },
                {
                  key: 'inReview',
                  value: String(summary.inReview || 0),
                  label: t('workspace.projectHubStatInReview'),
                  extra: t('workspace.projectHubStatInReviewPct', { pct: reviewPercent }),
                  tone: Number(summary.inReview) > 0 ? 'warning' : '',
                  tipItems: inReviewCards,
                  tipTotal: Number(summary.inReview) || 0,
                  tipHeading: t('workspace.projectHubHealthTipInReview'),
                },
                {
                  key: 'overdue',
                  value: String(summary.overdue),
                  label: t('workspace.projectHubStatOverdue'),
                  extra: '',
                  tone: attention === 'attention' ? 'destructive' : '',
                  tipItems: overdueCards,
                  tipTotal: Number(summary.overdue) || 0,
                  tipHeading: t('workspace.projectHubHealthTipOverdue'),
                },
              ].map(({ key, value, label, extra, tone, tipItems, tipTotal, tipHeading }) => {
                const tile = (
                  <div
                    className={`rounded-lg border bg-background px-2 py-3 text-center ${
                      tone === 'destructive'
                        ? 'border-destructive/50'
                        : tone === 'warning'
                          ? 'border-warning/40'
                          : tone === 'success'
                            ? 'border-success/30'
                            : 'border-border'
                    } ${tipItems?.length ? 'cursor-help' : ''}`}
                  >
                    <div className={`text-lg font-bold ${titleCls}`}>{value}</div>
                    <div className={`text-[10px] ${muted}`}>{label}</div>
                    {extra ? <div className={`mt-0.5 text-[10px] ${muted}`}>{extra}</div> : null}
                  </div>
                );
                if (!(tipItems?.length > 0)) {
                  return <div key={key}>{tile}</div>;
                }
                return (
                  <OverviewHealthTip
                    key={key}
                    items={tipItems}
                    totalCount={tipTotal}
                    heading={tipHeading}
                    moreLabel={t('workspace.projectHubHealthTipMore', {
                      n: Math.max(0, tipTotal - tipItems.length),
                    })}
                  >
                    {({ tipId, hasItems }) => (
                      <div
                        tabIndex={hasItems ? 0 : undefined}
                        aria-describedby={hasItems ? tipId : undefined}
                      >
                        {tile}
                      </div>
                    )}
                  </OverviewHealthTip>
                );
              })}
            </div>
            {attention === 'attention' && overdueCards.length > 0 ? (
              <OverviewHealthTip
                className="mt-3"
                items={overdueCards}
                totalCount={Number(summary.overdue) || 0}
                heading={t('workspace.projectHubHealthTipOverdue')}
                moreLabel={t('workspace.projectHubHealthTipMore', {
                  n: Math.max(0, (Number(summary.overdue) || 0) - overdueCards.length),
                })}
              >
                {({ tipId, hasItems }) => (
                  <div
                    className="flex cursor-help items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                    role="status"
                    tabIndex={hasItems ? 0 : undefined}
                    aria-describedby={hasItems ? tipId : undefined}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden />
                    <span className="font-medium">
                      {t('workspace.projectHubHealthAttention', { n: summary.overdue })}
                    </span>
                  </div>
                )}
              </OverviewHealthTip>
            ) : (
              <div
                className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  attention === 'attention'
                    ? 'border-destructive/40 bg-destructive/5 text-destructive'
                    : 'border-success/30 bg-success/5 text-success'
                }`}
                role="status"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    attention === 'attention' ? 'bg-destructive' : 'bg-success'
                  }`}
                  aria-hidden
                />
                <span className="font-medium">
                  {attention === 'attention'
                    ? t('workspace.projectHubHealthAttention', { n: summary.overdue })
                    : t('workspace.projectHubHealthOnTrack')}
                </span>
              </div>
            )}
            {extrasTiles.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {extrasTiles.map(([v, l]) => (
                  <div
                    key={l}
                    className="rounded-lg border border-dashed border-border bg-background px-2 py-2 text-center"
                  >
                    <div className={`text-sm font-bold ${titleCls}`}>{v}</div>
                    <div className={`text-[10px] ${muted}`}>{l}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      {boardLoading ? (
        <div className="mt-3">
          <OverviewContextSkeleton isDarkMode={isDarkMode} />
        </div>
      ) : (
        <ProjectHubOverviewCharts
          charts={dashboardCharts}
          cards={overviewCards}
          lists={overviewLists}
          members={overviewMembers}
          muted={muted}
          titleCls={titleCls}
          cardCls={cardCls}
          t={t}
          onOpenCard={onOpenNextAction}
        />
      )}

      {boardLoading ? null : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <section className={cardCls} aria-labelledby="overview-action-center">
            <h3
              id="overview-action-center"
              className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
            >
              {t('workspace.projectHubNextActions')}
            </h3>
            {nextActions.length === 0 ? (
              <p className={`text-sm ${muted}`}>{t('workspace.projectHubNextActionsEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {nextActions.map((a) => {
                  const dueCls =
                    a.dueTone === 'overdue'
                      ? 'text-destructive'
                      : a.dueTone === 'soon'
                        ? 'text-primary'
                        : muted;
                  const statusText = overviewActionStatusLabel(a, t);
                  const who = a.assigneeName || t('workspace.projectHubStatUnassigned');
                  return (
                    <li key={a.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => onOpenNextAction?.(a.id)}
                        className="w-full rounded-sm text-left text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                            {overviewIssueTypeLabel(a.issueType, t)}
                          </span>
                          {a.issueKey ? (
                            <span className="font-mono text-[10px] font-semibold text-primary">
                              {a.issueKey}
                            </span>
                          ) : null}
                        </div>
                        <span className={`mt-0.5 block font-medium ${titleCls}`}>{a.title}</span>
                        <span className={`mt-0.5 block text-[11px] ${muted}`}>
                          {statusText ? `${statusText} · ${who}` : who}
                        </span>
                        {a.dueDate ? (
                          <span className={`mt-0.5 block text-[11px] ${dueCls}`}>
                            {t('workspace.projectHubActionDue', {
                              date: formatHubDate(a.dueDate, locale),
                            })}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={cardCls} aria-labelledby="overview-delivery-snapshot">
            <h3
              id="overview-delivery-snapshot"
              className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
            >
              {t('workspace.projectHubDeliveryPulse')}
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className={muted}>{t('workspace.projectHubSnapshotProgress')}</dt>
                <dd className={`font-semibold ${titleCls}`}>{summary.donePercent}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className={muted}>{t('workspace.projectHubFieldDue')}</dt>
                <dd className={`font-medium ${titleCls}`}>{formatHubDate(board?.dueDate, locale)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className={muted}>{t('workspace.projectHubVisibilityLabel')}</dt>
                <dd className={`font-medium ${titleCls}`}>
                  {board?.visibility === 'workspace'
                    ? t('workspace.projectHubVisibilityWorkspace')
                    : t('workspace.projectHubVisibilityPrivate')}
                </dd>
              </div>
            </dl>

            <div className="mt-3 border-t border-border pt-3">
              <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                {t('workspace.projectHubOverviewActiveSprint')}
              </p>
              {sprintContextLoading ? (
                <div
                  className={`h-16 animate-pulse rounded-lg motion-reduce:animate-none ${
                    isDarkMode ? 'bg-white/10' : 'bg-muted'
                  }`}
                  aria-busy="true"
                  aria-label={t('common.loading')}
                />
              ) : activeSprint ? (
                <div className="space-y-1">
                  <p className={`text-sm font-semibold ${titleCls}`}>
                    {activeSprint.name || t('workspace.projectHubUntitled')}
                  </p>
                  <p className={`text-xs ${muted}`}>{overviewSprintStatusLabel(activeSprint, t)}</p>
                  {activeSprint.startDate || activeSprint.endDate ? (
                    <p className={`text-xs ${muted}`}>
                      {t('workspace.projectHubOverviewSprintDates', {
                        start: formatHubDate(activeSprint.startDate, locale),
                        end: formatHubDate(activeSprint.endDate, locale),
                      })}
                    </p>
                  ) : null}
                  <p className={`text-xs ${muted}`}>
                    {t('workspace.projectHubOverviewSprintIssues', { n: sprintIssueCount })}
                  </p>
                </div>
              ) : (
                <p className={`text-sm ${muted}`}>{t('workspace.projectHubOverviewActiveSprintEmpty')}</p>
              )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                {t('workspace.projectHubOverviewBacklogPulse')}
              </p>
              {planningContextLoading ? (
                <div
                  className={`h-12 animate-pulse rounded-lg motion-reduce:animate-none ${
                    isDarkMode ? 'bg-white/10' : 'bg-muted'
                  }`}
                  aria-busy="true"
                  aria-label={t('common.loading')}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [String(planningPulse.epic || 0), t('workspace.projectHubOverviewBacklogEpics')],
                    [String(planningPulse.feature || 0), t('workspace.projectHubOverviewBacklogFeatures')],
                  ].map(([v, l]) => (
                    <div key={l} className="text-center">
                      <div className={`text-sm font-bold ${titleCls}`}>{v}</div>
                      <div className={`text-[10px] ${muted}`}>{l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {board?.description ? (
              <p className={`mt-3 line-clamp-3 border-t border-border pt-3 text-xs ${muted}`}>
                {board.description}
              </p>
            ) : null}
          </section>
        </div>
      )}

      <div className={`${cardCls} mt-3`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubRecentActivity')}
          </p>
          {!activityLoading && !activityError && activity.length > 0 ? (
            <button
              type="button"
              onClick={onViewAllActivity}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
            >
              {t('workspace.projectHubActivityViewAll')}
            </button>
          ) : null}
        </div>
        {activityLoading ? (
          <div
            className={`h-24 animate-pulse rounded-lg motion-reduce:animate-none ${
              isDarkMode ? 'bg-white/10' : 'bg-muted'
            }`}
            aria-busy="true"
            aria-label={t('common.loading')}
          />
        ) : activityError ? (
          <div className="flex flex-col items-start gap-2">
            <p className={`text-sm ${muted}`}>{t('workspace.projectHubActivityLoadFail')}</p>
            <button
              type="button"
              onClick={onRetryActivity}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw size={14} aria-hidden />
              {t('workspace.projectHubActivityRetry')}
            </button>
          </div>
        ) : activity.length === 0 ? (
          <p className={`text-sm ${muted}`}>{t('workspace.projectHubActivityEmpty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className={`text-xs ${muted}`}>
                <span className={titleCls}>{a.title}</span>
                <span className="mt-0.5 block">
                  {a.actorName ? (
                    <>
                      <span className={titleCls}>{a.actorName}</span>
                      {a.detail || a.at ? ' · ' : ''}
                    </>
                  ) : null}
                  {[a.detail, formatHubDate(a.at, locale)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilesPanel({ files, isDarkMode, t }) {
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <h3 className={`mb-1 text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabFiles')}</h3>
      <p className={`mb-3 text-xs ${muted}`}>{t('workspace.projectHubFilesHint')}</p>
      {files.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.projectHubFilesEmpty')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <FileText size={16} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${titleCls}`}>{f.name}</div>
                <div className={`truncate text-[11px] ${muted}`}>
                  {f.cardTitle || '—'}
                </div>
              </div>
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"
                >
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTIVITY_PAGE_SIZE = 10;

function ActivityPanel({ activity, locale, isDarkMode, t }) {
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((activity.length || 0) / ACTIVITY_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = activity.slice((safePage - 1) * ACTIVITY_PAGE_SIZE, safePage * ACTIVITY_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activity.length]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h3 className={`mb-1 text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabActivity')}</h3>
      <p className={`mb-3 text-xs ${muted}`}>{t('workspace.projectHubActivityHint')}</p>
      {activity.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.projectHubActivityEmpty')}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {paged.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <div className={`text-sm font-semibold ${titleCls}`}>{a.title}</div>
                <div className={`mt-0.5 text-xs ${muted}`}>
                  {a.actorName ? (
                    <>
                      <span className={titleCls}>{a.actorName}</span>
                      {' · '}
                    </>
                  ) : null}
                  {formatHubDate(a.at, locale)}
                  {a.detail ? ` · ${a.detail}` : ''}
                  {!a.actorName && a.assigneeName ? ` · ${a.assigneeName}` : ''}
                </div>
              </li>
            ))}
          </ul>
          {activity.length > ACTIVITY_PAGE_SIZE ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                aria-label={t('workspace.projectHubActivityPrev')}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {t('workspace.projectHubActivityPrev')}
              </button>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {t('workspace.projectHubActivityPage', { page: safePage, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                aria-label={t('workspace.projectHubActivityNext')}
              >
                {t('workspace.projectHubActivityNext')}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Project Hub — header identity + tabs (Figma IA).
 * `boardSlot` = Kanban (TaskBoardWorkspacePanel) khi tab board.
 */
export default function ProjectHubShell({
  board = null,
  boardId = '',
  projectId: projectIdProp = '',
  boardDetail = null,
  loadingBoardDetail = false,
  boards = [],
  isDarkMode = false,
  locale = 'vi',
  canManage = false,
  organizationId = '',
  apiCtx = null,
  onRefresh,
  onUpdateCard = null,
  onPatchBoardCards = null,
  workspaceSlug = '',
  boardSlot = null,
  emptySlot = null,
  onBack = null,
  onBoardChange: _onBoardChange = null,
  currentUserId = '',
}) {
  const { t } = useAppStrings();
  const [tab, setTab] = useState('overview');
  const [visitedTabs, setVisitedTabs] = useState(() => ({ overview: true }));
  const prevHubProjectIdRef = useRef('');
  const [membersEpoch, setMembersEpoch] = useState(0);
  const [apiActivity, setApiActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [activityReloadToken, setActivityReloadToken] = useState(0);
  const [apiFiles, setApiFiles] = useState(null);
  const [projectPayload, setProjectPayload] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [planningItems, setPlanningItems] = useState([]);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState(false);
  const [planningReloadToken, setPlanningReloadToken] = useState(0);
  const loadedPlanningProjectRef = useRef('');
  const planningFetchKeyRef = useRef('');
  const sprintsLoadedForRef = useRef('');
  const activityLoadedForRef = useRef('');
  const filesLoadedForRef = useRef('');
  const [completeSprintId, setCompleteSprintId] = useState(null);
  const [completeProjectOpen, setCompleteProjectOpen] = useState(false);
  const [boardOpenCrId, setBoardOpenCrId] = useState('');
  const [crWorkIssue, setCrWorkIssue] = useState(null);
  const [overviewWorkIssue, setOverviewWorkIssue] = useState(null);
  const [hubChatChannelId, setHubChatChannelId] = useState('');
  const [sprintsFetching, setSprintsFetching] = useState(false);

  const hubCaps = useMemo(
    () => resolveHubCapabilities(projectPayload, { canManageFallback: canManage }),
    [projectPayload, canManage]
  );

  const resolvedBoard = useMemo(() => {
    if (boardDetail?.board) return boardDetail.board;
    if (board) return board;
    return boards.find((b) => String(b._id) === String(boardId)) || null;
  }, [board, boardDetail?.board, boards, boardId]);

  const projectId = String(
    projectIdProp ||
      resolvedBoard?.projectId ||
      boards.find((b) => String(b._id) === String(boardId))?.projectId ||
      ''
  ).trim();

  if (prevHubProjectIdRef.current !== projectId) {
    prevHubProjectIdRef.current = projectId;
    setTab('overview');
    setVisitedTabs({ overview: true });
    setSprints([]);
    setPlanningItems([]);
    setApiActivity(null);
    setActivityLoading(false);
    setActivityError(false);
    setActivityReloadToken(0);
    setApiFiles(null);
    setPlanningLoading(false);
    setPlanningError(false);
    setSprintsFetching(false);
    loadedPlanningProjectRef.current = '';
    planningFetchKeyRef.current = '';
    sprintsLoadedForRef.current = '';
    activityLoadedForRef.current = '';
    filesLoadedForRef.current = '';
    setCompleteProjectOpen(false);
    setOverviewWorkIssue(null);
    setHubChatChannelId('');
  }

  const cards = Array.isArray(boardDetail?.cards) ? boardDetail.cards : [];
  const lists = Array.isArray(boardDetail?.lists) ? boardDetail.lists : [];
  const summary = useMemo(() => computeHubBoardSummary(cards, lists), [cards, lists]);
  const overdueHealthCards = useMemo(
    () => listHubHealthCards(cards, lists, 'overdue', { limit: 8 }),
    [cards, lists]
  );
  const inReviewHealthCards = useMemo(
    () => listHubHealthCards(cards, lists, 'inReview', { limit: 8 }),
    [cards, lists]
  );
  const isProjectCompleted = isProjectCompletedStatus(
    projectPayload?.status || resolvedBoard?.status
  );
  const workLooksComplete = summary.total > 0 && summary.donePercent === 100;
  const needsSprints =
    tab === 'overview' ||
    tab === 'planning' ||
    tab === 'timeline' ||
    tab === 'board' ||
    (Boolean(hubCaps.canCompleteProject) && workLooksComplete && !isProjectCompleted);
  const needsPlanningItems =
    tab === 'overview' || tab === 'planning' || tab === 'timeline' || tab === 'board';
  const needsActivity = tab === 'overview' || tab === 'activity';
  const needsFiles = tab === 'files';

  useEffect(() => {
    if (!projectId) {
      setProjectPayload(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.get(projectId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (!cancelled) setProjectPayload(data || null);
      } catch {
        if (!cancelled) setProjectPayload(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, boardDetail?.board?.status]);

  useEffect(() => {
    if (!projectId || !needsSprints) return undefined;
    if (sprintsLoadedForRef.current === projectId) return undefined;
    let cancelled = false;
    setSprintsFetching(true);
    (async () => {
      try {
        const res = await projectAPI.listSprints(projectId);
        if (cancelled) return;
        setSprints(unwrapPlanningList(res));
        sprintsLoadedForRef.current = projectId;
      } catch {
        if (!cancelled) setSprints([]);
        if (!cancelled) sprintsLoadedForRef.current = projectId;
      } finally {
        if (!cancelled) setSprintsFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, needsSprints]);

  const patchPlanningItems = useCallback((updater) => {
    setPlanningItems((prev) => (typeof updater === 'function' ? updater(prev) : prev));
  }, []);

  const reloadPlanning = useCallback(() => setPlanningReloadToken((n) => n + 1), []);

  const reloadSprints = useCallback(async () => {
    const pid = String(projectId || '').trim();
    if (!pid) {
      setSprints([]);
      sprintsLoadedForRef.current = '';
      return;
    }
    try {
      const res = await projectAPI.listSprints(pid);
      setSprints(unwrapPlanningList(res));
      sprintsLoadedForRef.current = pid;
    } catch {
      /* giữ sprint hiện tại */
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !needsPlanningItems) return undefined;
    const fetchKey = `${projectId}:${planningReloadToken}`;
    if (planningFetchKeyRef.current === fetchKey) return undefined;
    let cancelled = false;
    const isFirstForProject = loadedPlanningProjectRef.current !== projectId;
    (async () => {
      if (isFirstForProject) {
        setPlanningLoading(true);
        setPlanningError(false);
      }
      try {
        const res = await projectAPI.listPlanningItems(projectId);
        if (cancelled) return;
        setPlanningItems(unwrapPlanningList(res));
        loadedPlanningProjectRef.current = projectId;
        planningFetchKeyRef.current = fetchKey;
        setPlanningError(false);
      } catch {
        if (cancelled) return;
        if (isFirstForProject) {
          setPlanningItems([]);
          setPlanningError(true);
        }
      } finally {
        if (!cancelled && isFirstForProject) setPlanningLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, planningReloadToken, needsPlanningItems]);

  const boardReady = useMemo(() => isBoardSprintReady(sprints), [sprints]);
  const cardsForSprintResolve = useMemo(
    () => (Array.isArray(boardDetail?.cards) ? boardDetail.cards : []),
    [boardDetail?.cards]
  );
  const activeSprint = useMemo(
    () =>
      resolveViewerActiveSprint({
        sprints,
        cards: cardsForSprintResolve,
        userId: currentUserId,
      }),
    [sprints, cardsForSprintResolve, currentUserId]
  );
  const sprintFilterId =
    boardReady && activeSprint?._id ? String(activeSprint._id) : '';

  const boardKanban = isValidElement(boardSlot)
    ? cloneElement(boardSlot, {
        sprintFilterId: sprintFilterId || undefined,
        defaultSprintId: sprintFilterId || undefined,
        hubSprintCard: {
          projectCode: resolvedBoard?.projectCode || '',
          onOpenChangeRequest: (crId) => {
            const id = String(crId || '').trim();
            if (!id) return;
            setVisitedTabs((prev) => ({ ...prev, changeRequests: true }));
            setBoardOpenCrId(id);
            setTab('changeRequests');
          },
        },
      })
    : boardSlot;

  const projectAccess = projectPayload?.access || null;

  const informationLevel = String(
    projectAccess?.informationLevel ||
      resolvedBoard?.access?.informationLevel ||
      boardDetail?.access?.informationLevel ||
      ''
  ).toLowerCase();
  const isSummaryOnly = informationLevel === 'summary';

  const visibleTabs = useMemo(() => {
    return PROJECT_HUB_TABS.filter((item) => {
      if (isSummaryOnly && item.id !== 'overview') return false;
      if (item.id === 'settings' && !hubCaps.canManageSettings) return false;
      if (item.id === 'members' && !hubCaps.canViewMembers) return false;
      if (item.id === 'changeRequests' && !hubCaps.canViewChangeRequests) return false;
      if (item.id === 'chat' && !isProjectChatTabEnabled()) return false;
      return true;
    });
  }, [hubCaps, isSummaryOnly]);

  useEffect(() => {
    if (isSummaryOnly && tab !== 'overview') setTab('overview');
  }, [isSummaryOnly, tab]);

  useEffect(() => {
    if (tab === 'members' && !hubCaps.canViewMembers) setTab('overview');
  }, [tab, hubCaps.canViewMembers]);

  useEffect(() => {
    if (tab === 'changeRequests' && !hubCaps.canViewChangeRequests) setTab('overview');
  }, [tab, hubCaps.canViewChangeRequests]);

  useEffect(() => {
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [tab]);

  const showListPanel = Boolean(visitedTabs.list);
  const showPlanningPanel = Boolean(visitedTabs.planning);
  const showTimelinePanel = Boolean(visitedTabs.timeline);
  const showChangeRequestsPanel =
    Boolean(visitedTabs.changeRequests) && hubCaps.canViewChangeRequests;
  const showMembersPanel = Boolean(visitedTabs.members) && hubCaps.canViewMembers;

  const issueCounts = useMemo(() => countCardsByIssueType(cards), [cards]);
  const dashboardCharts = useMemo(
    () =>
      buildOverviewDashboardCharts({
        cards,
        lists,
        issueCounts,
        priorityConfig: projectPayload?.priorityConfig,
        members: Array.isArray(projectPayload?.members) ? projectPayload.members : [],
      }),
    [cards, lists, issueCounts, projectPayload?.priorityConfig, projectPayload?.members]
  );
  const deliveryExtras = useMemo(
    () => ({
      unassigned: countUnassignedOpenCards(cards, lists),
      estimateHours: sumOpenCardEstimateHours(cards, lists),
    }),
    [cards, lists]
  );
  const overviewProjectStatus = projectPayload?.status || resolvedBoard?.status || '';
  const planningPulse = useMemo(() => countPlanningByType(planningItems), [planningItems]);
  const overviewSprintIssueCount = useMemo(
    () => countCardsInSprint(cards, activeSprint?._id),
    [cards, activeSprint?._id]
  );
  const sprintContextLoading = tab === 'overview' && sprintsFetching;
  const planningContextLoading = tab === 'overview' && planningLoading;
  const defaultListId = String(lists[0]?._id || '').trim();
  const derivedFiles = useMemo(() => collectCardAttachments(cards), [cards]);
  const derivedActivity = useMemo(() => collectCardActivity(cards), [cards]);
  const files = Array.isArray(apiFiles) ? apiFiles : derivedFiles;
  const nextActions = useMemo(
    () => pickNextHubActions(cards, lists, { projectCode: resolvedBoard?.projectCode || '' }),
    [cards, lists, resolvedBoard?.projectCode]
  );
  const activity = useMemo(() => {
    const source = Array.isArray(apiActivity) ? apiActivity : derivedActivity;
    return (source || []).map((row) => mapHubActivityItem(row, t, { locale }));
  }, [apiActivity, derivedActivity, t, locale]);

  const reloadActivity = useCallback(() => {
    activityLoadedForRef.current = '';
    setActivityError(false);
    setActivityReloadToken((n) => n + 1);
  }, []);

  const handleOpenNextAction = useCallback(
    (actionId) => {
      const card = cards.find((c) => String(c._id || c.id) === String(actionId));
      if (card) setOverviewWorkIssue(card);
    },
    [cards]
  );

  const handleViewAllActivity = useCallback(() => {
    setVisitedTabs((prev) => ({ ...prev, activity: true }));
    setTab('activity');
  }, []);

  useEffect(() => {
    if (!projectId || !needsActivity) return undefined;
    if (activityLoadedForRef.current === projectId) return undefined;
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(false);
    (async () => {
      try {
        const actRes = await projectAPI.getActivity(projectId, { limit: 40 });
        if (cancelled) return;
        const act = actRes?.data?.data ?? actRes?.data ?? [];
        setApiActivity(Array.isArray(act) ? act : []);
        activityLoadedForRef.current = projectId;
      } catch {
        if (!cancelled) {
          setApiActivity([]);
          setActivityError(true);
          activityLoadedForRef.current = projectId;
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, needsActivity, activityReloadToken]);

  useEffect(() => {
    if (!projectId || !needsFiles) return undefined;
    if (filesLoadedForRef.current === projectId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const filesRes = await projectAPI.getFiles(projectId);
        if (cancelled) return;
        const fl = filesRes?.data?.data ?? filesRes?.data ?? [];
        setApiFiles(
          (Array.isArray(fl) ? fl : []).map((f) => ({
            name: f.name,
            url: f.url,
            cardTitle: f.taskTitle,
          }))
        );
        filesLoadedForRef.current = projectId;
      } catch {
        if (!cancelled) setApiFiles(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, needsFiles]);

  const hasBoard = Boolean(boardId && resolvedBoard);
  const initials = projectInitials(resolvedBoard?.title);
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const sprintsReadyForCompleteGate = sprintsLoadedForRef.current === projectId;
  const hasOpenSprints = (sprints || []).some((s) => {
    const st = String(s?.status || '').toLowerCase();
    return st === 'planned' || st === 'active';
  });
  const showCompleteProjectButton =
    hasBoard &&
    Boolean(hubCaps.canCompleteProject) &&
    !isProjectCompleted &&
    workLooksComplete &&
    sprintsReadyForCompleteGate &&
    !hasOpenSprints;

  const toolbar = (
    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {hasBoard && isProjectCompleted ? (
        <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
          {t('workspace.projectHubCompleteProjectBadge')}
        </span>
      ) : null}
      {showCompleteProjectButton ? (
        <button
          type="button"
          onClick={() => setCompleteProjectOpen(true)}
          title={t('workspace.projectHubCompleteProject')}
          className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
        >
          <span className="hidden sm:inline">{t('workspace.projectHubCompleteProject')}</span>
          <span className="sm:hidden">{t('workspace.projectHubCompleteProjectShort')}</span>
        </button>
      ) : null}
      {tab === 'board' && hubCaps?.canManageSprints && activeSprint?._id ? (
        <button
          type="button"
          onClick={() => setCompleteSprintId(String(activeSprint._id))}
          disabled={!boardReady}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {t('workspace.projectHubPlanCompleteSprint')}
        </button>
      ) : null}
    </div>
  );

  if (!hasBoard) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 ${
            isDarkMode ? 'border-white/10' : 'border-border'
          }`}
        >
          {onBack ? (
            <button
              type="button"
              onClick={() => onBack()}
              className={`rounded-md p-1.5 transition ${
                isDarkMode
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-label={t('taskBoard.backAria')}
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          {toolbar}
        </div>
        {emptySlot}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Compact enterprise header — identity + tabs in one contained area */}
      <header
        className={`shrink-0 border-b ${
          isDarkMode ? 'border-white/10 bg-[#0b1120]/90' : 'border-border bg-surface'
        }`}
      >
        {/* Identity row */}
        <div className="flex min-w-0 items-center gap-2.5 px-4 pt-2.5 pb-2">
          {onBack ? (
            <button
              type="button"
              onClick={() => onBack()}
              className={`-ml-1 shrink-0 rounded-md p-1 transition ${
                isDarkMode
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-label={t('taskBoard.backAria')}
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-black text-primary-foreground">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className={`truncate text-sm font-bold leading-tight ${titleCls}`}>
              {resolvedBoard?.title || t('workspace.projectHubUntitled')}
            </h2>
            {resolvedBoard?.projectCode ? (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  isDarkMode ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'
                }`}
              >
                {resolvedBoard.projectCode}
              </span>
            ) : null}
            {resolvedBoard?.methodology ? (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-muted text-muted-foreground'
                }`}
              >
                {formatHubMethodology(resolvedBoard.methodology, t)}
              </span>
            ) : null}
            <span className={`truncate text-[11px] leading-tight ${muted}`}>
              {[
                formatHubDate(resolvedBoard?.dueDate, locale) !== '—'
                  ? formatHubDate(resolvedBoard?.dueDate, locale)
                  : null,
                resolvedBoard?.visibility === 'workspace'
                  ? t('workspace.projectHubVisibilityWorkspace')
                  : null,
                t('workspace.projectHubStatDonePct', { pct: summary.donePercent }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          {toolbar}
        </div>

        {/* Tab bar — underline style */}
        <nav
          className="flex gap-0 overflow-x-auto px-4"
          aria-label={t('workspace.projectHubNavAria')}
          style={{ scrollbarWidth: 'none' }}
        >
          {visibleTabs.map((item) => {
            const active = tab === item.id;
            const disabled = isSummaryOnly && item.id !== 'overview';
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setTab(item.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors ${
                  disabled
                    ? 'cursor-not-allowed border-transparent text-muted-foreground/40'
                    : active
                    ? isDarkMode
                      ? 'border-primary text-white'
                      : 'border-primary text-primary'
                    : isDarkMode
                      ? 'border-transparent text-slate-400 hover:text-slate-200'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
      </header>

      {isSummaryOnly ? (
        <div className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t('workspace.projectHubSummaryOnlyBanner')}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'overview' ? (
          <OverviewPanel
            board={resolvedBoard}
            projectStatus={overviewProjectStatus}
            summary={summary}
            deliveryExtras={deliveryExtras}
            dashboardCharts={dashboardCharts}
            nextActions={nextActions}
            overdueCards={overdueHealthCards}
            inReviewCards={inReviewHealthCards}
            overviewCards={cards}
            overviewLists={lists}
            overviewMembers={Array.isArray(projectPayload?.members) ? projectPayload.members : []}
            activity={activity}
            activityLoading={activityLoading}
            activityError={activityError}
            onRetryActivity={reloadActivity}
            activeSprint={activeSprint}
            sprintIssueCount={overviewSprintIssueCount}
            planningPulse={planningPulse}
            boardLoading={loadingBoardDetail}
            sprintContextLoading={sprintContextLoading}
            planningContextLoading={planningContextLoading}
            locale={locale}
            isDarkMode={isDarkMode}
            onOpenBoard={() => setTab('board')}
            onOpenBacklog={() => setTab('planning')}
            onOpenNextAction={handleOpenNextAction}
            onViewAllActivity={handleViewAllActivity}
            t={t}
          />
        ) : null}
        {showListPanel ? (
        <div
          className={
            tab === 'list' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'
          }
          hidden={tab !== 'list'}
          aria-hidden={tab !== 'list'}
        >
          <ProjectHubListPanel
            projectId={projectId}
            boardId={boardId}
            defaultListId={defaultListId}
            lists={lists}
            projectCode={resolvedBoard?.projectCode || ''}
            hubCaps={hubCaps}
            canManage={canManage}
            apiCtx={apiCtx}
            isDarkMode={isDarkMode}
            locale={locale}
            workspaceSlug={workspaceSlug}
            onPatchPlanningItems={patchPlanningItems}
            onReloadPlanning={reloadPlanning}
            onRefresh={onRefresh}
            onUpdateCard={onUpdateCard}
            onPatchBoardCards={onPatchBoardCards}
            onOpenSettings={() => setTab('settings')}
            listActive={tab === 'list'}
            membersEpoch={membersEpoch}
            workTypeConfig={projectPayload?.workTypeConfig}
            priorityConfig={projectPayload?.priorityConfig}
          />
        </div>
        ) : null}
        {showPlanningPanel ? (
        <div
          className={
            tab === 'planning' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'
          }
          hidden={tab !== 'planning'}
          aria-hidden={tab !== 'planning'}
        >
          <ProjectHubPlanningPanel
            projectId={projectId}
            canManage={canManage}
            hubCaps={hubCaps}
            isDarkMode={isDarkMode}
            locale={locale}
            boardId={boardId}
            defaultListId={defaultListId}
            apiCtx={apiCtx}
            boardCards={cards}
            lists={lists}
            projectCode={resolvedBoard?.projectCode || ''}
            planningItems={planningItems}
            planningLoading={planningLoading}
            planningError={planningError}
            sprints={sprints}
            onPatchPlanningItems={patchPlanningItems}
            onReloadPlanning={reloadPlanning}
            onReloadSprints={reloadSprints}
            onRefresh={() => {
              onRefresh?.();
              void reloadSprints();
            }}
            onPatchBoardCards={onPatchBoardCards}
            onOpenBoard={() => setTab('board')}
            onOpenChangeRequest={(crId) => {
              const id = String(crId || '').trim();
              if (!id) return;
              setVisitedTabs((prev) => ({ ...prev, changeRequests: true }));
              setBoardOpenCrId(id);
              setTab('changeRequests');
            }}
            workTypeConfig={projectPayload?.workTypeConfig}
            priorityConfig={projectPayload?.priorityConfig}
          />
        </div>
        ) : null}
        {showTimelinePanel ? (
        <div
          className={
            tab === 'timeline' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'
          }
          hidden={tab !== 'timeline'}
          aria-hidden={tab !== 'timeline'}
        >
          <ProjectHubTimelinePanel
            projectId={projectId}
            boardId={boardId}
            defaultListId={defaultListId}
            lists={lists}
            projectCode={resolvedBoard?.projectCode || ''}
            hubCaps={hubCaps}
            canManage={canManage}
            apiCtx={apiCtx}
            isDarkMode={isDarkMode}
            locale={locale}
            workspaceSlug={workspaceSlug}
            board={resolvedBoard}
            projectPayload={projectPayload}
            cards={cards}
            planningItems={planningItems}
            planningLoading={planningLoading}
            planningError={planningError}
            sprints={sprints}
            onPatchPlanningItems={patchPlanningItems}
            onReloadPlanning={reloadPlanning}
            onRefresh={onRefresh}
            onUpdateCard={onUpdateCard}
            onPatchBoardCards={onPatchBoardCards}
            timelineActive={tab === 'timeline'}
            workTypeConfig={projectPayload?.workTypeConfig}
          />
        </div>
        ) : null}
        {tab === 'board' ? (
          boardReady ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{boardKanban}</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-foreground'}`}>
                {t('workspace.projectHubBoardLockedTitle')}
              </p>
              <p className={`max-w-md text-xs ${isDarkMode ? 'text-slate-400' : 'text-muted-foreground'}`}>
                {t('workspace.projectHubBoardLockedHint')}
              </p>
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                onClick={() => setTab('planning')}
              >
                {t('workspace.projectHubBoardLockedCta')}
              </button>
            </div>
          )
        ) : null}
        {tab === 'chat' && isProjectChatTabEnabled() ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProjectChatWorkspace
              organizationId={organizationId}
              projectIdFilter={projectId}
              channelId={hubChatChannelId}
              onSelectChannel={setHubChatChannelId}
            />
          </div>
        ) : null}
        {showChangeRequestsPanel ? (
        <div
          className={
            tab === 'changeRequests' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'
          }
          hidden={tab !== 'changeRequests'}
          aria-hidden={tab !== 'changeRequests'}
        >
          <ProjectHubChangeRequestsPanel
            projectId={projectId}
            listActive={tab === 'changeRequests'}
            isDarkMode={isDarkMode}
            locale={locale}
            projectCode={resolvedBoard?.projectCode || ''}
            canCreate={hubCaps.canCreateChangeRequest}
            canUpdate={hubCaps.canUpdateChangeRequest}
            canDelete={hubCaps.canDeleteChangeRequest}
            boardCards={cards}
            lists={lists}
            boardId={boardId}
            apiCtx={apiCtx}
            externalCrId={boardOpenCrId}
            onExternalCrConsumed={() => setBoardOpenCrId('')}
            onRefreshBoard={onRefresh}
            onOpenWorkItem={(work) => {
              const id = String(work?._id || work?.id || '');
              const fromBoard = cards.find((c) => String(c._id || c.id) === id);
              setCrWorkIssue(fromBoard || work || null);
            }}
          />
        </div>
        ) : null}
        {showMembersPanel ? (
        <div
          className={
            tab === 'members' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'
          }
          hidden={tab !== 'members'}
          aria-hidden={tab !== 'members'}
        >
          <ProjectHubMembersPanel
            projectId={projectId}
            boardId={boardId}
            organizationId={organizationId}
            projectPayload={projectPayload}
            membersActive={tab === 'members'}
            canManage={hubCaps.canManageMembers || canManage}
            isDarkMode={isDarkMode}
            onMembersChanged={() => setMembersEpoch((n) => n + 1)}
          />
        </div>
        ) : null}
        {tab === 'files' ? <FilesPanel files={files} isDarkMode={isDarkMode} t={t} /> : null}
        {tab === 'activity' ? (
          <ActivityPanel activity={activity} locale={locale} isDarkMode={isDarkMode} t={t} />
        ) : null}
        {tab === 'settings' ? (
          <ProjectHubSettingsPanel
            projectId={projectId}
            boardId={boardId}
            board={resolvedBoard}
            projectPayload={projectPayload}
            organizationId={organizationId}
            apiCtx={apiCtx}
            canManage={hubCaps.canManageSettings || canManage}
            canManageDelivery={Boolean(hubCaps.canManageDelivery)}
            isDarkMode={isDarkMode}
            onSaved={onRefresh}
            workTypeConfig={projectPayload?.workTypeConfig}
            priorityConfig={projectPayload?.priorityConfig}
          />
        ) : null}

        <ProjectHubCompleteSprintModal
          isOpen={Boolean(completeSprintId)}
          projectId={projectId}
          sprint={
            completeSprintId
              ? sprints.find((s) => String(s._id) === String(completeSprintId)) || null
              : null
          }
          canManageSprints={Boolean(hubCaps?.canManageSprints || canManage)}
          onClose={() => setCompleteSprintId(null)}
          onCompleted={() => {
            toast.success(t('workspace.projectHubPlanSprintClosed'));
            void reloadSprints();
            reloadPlanning();
            onRefresh?.();
            setCompleteSprintId(null);
          }}
        />
        <ProjectHubCompleteProjectModal
          isOpen={completeProjectOpen}
          projectId={projectId}
          projectTitle={resolvedBoard?.title || ''}
          canComplete={Boolean(hubCaps.canCompleteProject) && !isProjectCompleted}
          onClose={() => setCompleteProjectOpen(false)}
          onCompleted={async (data) => {
            toast.success(t('workspace.projectHubCompleteProjectSuccess'));
            const closed = data?.project || data || {};
            setProjectPayload((prev) => ({
              ...(prev || {}),
              ...closed,
              status: closed.status || 'closed',
            }));
            setCompleteProjectOpen(false);
            onRefresh?.();
          }}
        />
        {crWorkIssue ? (
          <WorkItemDetail
            open
            chrome="drawer"
            drawerLayout="overlay"
            workItem={crWorkIssue}
            boardCards={cards}
            lists={lists}
            epics={planningItems.filter((p) => String(p.type || '').toLowerCase() === 'epic')}
            features={planningItems.filter((p) => String(p.type || '').toLowerCase() === 'feature')}
            sprints={sprints}
            projectCode={resolvedBoard?.projectCode || ''}
            projectId={projectId}
            boardId={boardId}
            defaultListId={defaultListId}
            apiCtx={apiCtx}
            isDarkMode={isDarkMode}
            locale={locale}
            workTypeConfig={projectPayload?.workTypeConfig}
            canCreateTask={Boolean(hubCaps?.canCreateTask || canManage)}
            canComment={
              Boolean(canManage) ||
              (Array.isArray(hubCaps?.permissions) && hubCaps.permissions.includes('task:comment'))
            }
            canChangeStatus={
              Boolean(canManage) ||
              (Array.isArray(hubCaps?.permissions) &&
                hubCaps.permissions.includes('task:change_status'))
            }
            onClose={() => setCrWorkIssue(null)}
            onOpenWorkItem={(card) => {
              if (card) setCrWorkIssue(card);
            }}
            onPatchBoardCards={onPatchBoardCards}
            onOpenChangeRequest={(crId) => {
              const id = String(crId || '').trim();
              if (!id) return;
              setCrWorkIssue(null);
              setVisitedTabs((prev) => ({ ...prev, changeRequests: true }));
              setBoardOpenCrId(id);
              setTab('changeRequests');
            }}
            onUpdateCard={async (cardId, patch) => {
              onPatchBoardCards?.((prev) =>
                (prev || []).map((c) =>
                  String(c._id || c.id) === String(cardId) ? { ...c, ...patch } : c
                )
              );
              setCrWorkIssue((prev) =>
                prev && String(prev._id || prev.id) === String(cardId) ? { ...prev, ...patch } : prev
              );
              const keys = Object.keys(patch || {});
              if (keys.length === 1 && keys[0] === 'comments') return;
              if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
                try {
                  await taskAPI.updateBoardCard(cardId, patch, apiCtx || {});
                } catch (err) {
                  toast.error(
                    resolveApiErrorMessage(err, {
                      t,
                      fallback: t('workspace.projectHubPlanCreateFail'),
                    })
                  );
                  throw err;
                }
              }
            }}
          />
        ) : null}
        {overviewWorkIssue ? (
          <WorkItemDetail
            key={String(overviewWorkIssue?._id || overviewWorkIssue?.id || 'overview-detail')}
            open
            chrome="drawer"
            drawerLayout="overlay"
            isDarkMode={isDarkMode}
            workspaceSlug={workspaceSlug}
            workItem={overviewWorkIssue}
            boardId={boardId}
            lists={lists}
            boardCards={cards}
            epics={planningItems.filter((p) => String(p.type || '').toLowerCase() === 'epic')}
            features={planningItems.filter((p) => String(p.type || '').toLowerCase() === 'feature')}
            sprints={sprints}
            workTypeConfig={projectPayload?.workTypeConfig}
            priorityConfig={projectPayload?.priorityConfig}
            projectCode={resolvedBoard?.projectCode || ''}
            projectId={projectId}
            defaultListId={defaultListId}
            apiCtx={apiCtx}
            locale={locale}
            initialPanel="detail"
            canCreateTask={Boolean(hubCaps?.canCreateTask || canManage)}
            canEstimate={Boolean(canManage || hubCaps?.canEstimate)}
            canComment={
              Boolean(canManage) ||
              (Array.isArray(hubCaps?.permissions) && hubCaps.permissions.includes('task:comment'))
            }
            canChangeStatus={
              Boolean(canManage) ||
              (Array.isArray(hubCaps?.permissions) &&
                hubCaps.permissions.includes('task:change_status'))
            }
            onClose={() => setOverviewWorkIssue(null)}
            onOpenWorkItem={(card) => {
              if (card) setOverviewWorkIssue(card);
            }}
            onPatchBoardCards={onPatchBoardCards}
            onUpdateCard={async (cardId, patch) => {
              onPatchBoardCards?.((prev) =>
                (prev || []).map((c) =>
                  String(c._id || c.id) === String(cardId) ? { ...c, ...patch } : c
                )
              );
              setOverviewWorkIssue((prev) =>
                prev && String(prev._id || prev.id) === String(cardId) ? { ...prev, ...patch } : prev
              );
              const keys = Object.keys(patch || {});
              if (keys.length === 1 && keys[0] === 'comments') return;
              if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
                try {
                  await taskAPI.updateBoardCard(cardId, patch, apiCtx || {});
                } catch (err) {
                  toast.error(
                    resolveApiErrorMessage(err, {
                      t,
                      fallback: t('workspace.projectHubPlanCreateFail'),
                    })
                  );
                  throw err;
                }
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
