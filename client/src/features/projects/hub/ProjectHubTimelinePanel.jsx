import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import UserAvatar from '../../../components/Shared/UserAvatar';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import WorkItemDetail from './WorkItemDetail';
import { buildListTree } from './projectHubHierarchy';
import { flattenExpandedRows } from './projectHubListLazy';
import {
  childWorkProgressBarClass,
  childWorkProgressPct,
  classifyListStatusBucket,
  displayIssueKey,
  statusBucketPillClass,
  unwrapPlanningEntity,
} from './projectHubUtils';
import { childWorkStats } from './projectHubBacklogStats';
import {
  TIMELINE_ROW_PX,
  TIMELINE_SCALES,
  TIMELINE_SCROLL_EDGE_PX,
  barPlacement,
  buildInitialWindow,
  columnsTotalWidth,
  enumerateColumns,
  extendWindow,
  groupTimelineColumns,
  isSameLocalDay,
  rangeForTimelineNode,
  resolveProjectTimeBounds,
  sprintBarPlacement,
  todayOffsetPx,
} from './projectHubTimeline';

const WORK_COL_PX = 288;
const HEADER_PX = 56;
const TYPE_FILTERS = ['epic', 'feature', 'story', 'task', 'bug', 'subtask'];
const STATUS_FILTERS = ['todo', 'progress', 'done'];
const TYPE_LABEL_KEYS = {
  epic: 'workspace.projectHubIssueTypeEpic',
  feature: 'workspace.projectHubIssueTypeFeature',
  story: 'workspace.projectHubIssueTypeStory',
  task: 'workspace.projectHubIssueTypeTask',
  bug: 'workspace.projectHubIssueTypeBug',
  subtask: 'workspace.projectHubIssueTypeSubtask',
};
const STATUS_LABEL_KEYS = {
  todo: 'workspace.projectHubBacklogStatusTodo',
  progress: 'workspace.projectHubBacklogStatusProgress',
  done: 'workspace.projectHubBacklogStatusDone',
};
const SCALE_LABEL_KEYS = {
  weeks: 'workspace.projectHubTimelineWeeks',
  months: 'workspace.projectHubTimelineMonths',
  quarters: 'workspace.projectHubTimelineQuarters',
};

function entityId(row) {
  return String(row?._id || row?.id || '');
}

function upsertById(list, row) {
  const id = entityId(row);
  if (!id) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list : [];
  let found = false;
  const next = current.map((item) => {
    if (entityId(item) !== id) return item;
    found = true;
    return { ...item, ...row };
  });
  if (!found) next.push(row);
  return next;
}

function nodeStatusBucket(node, lists) {
  const raw = node?.raw || {};
  if (node?.kind === 'planning') {
    const s = String(raw.status || '').toLowerCase();
    if (s === 'active') return 'progress';
    return classifyListStatusBucket(raw.status);
  }
  const list = (lists || []).find((l) => String(l._id || l.id) === String(raw.listId || raw.list || ''));
  return classifyListStatusBucket(raw.status || list);
}

function resolveAssignee(raw) {
  const first = raw?.assignees?.[0];
  if (first) {
    return {
      name: String(first.displayName || first.name || '').trim(),
      avatar: first.avatar || first.avatarUrl || '',
      userId: first.userId || first.id || null,
    };
  }
  if (raw?.assigneeName || raw?.assigneeId) {
    return {
      name: String(raw.assigneeName || '').trim(),
      avatar: raw.assigneeAvatar || '',
      userId: raw.assigneeId || null,
    };
  }
  return null;
}

function filterTimelineTree(nodes, { query, epicId, type, status }, ctx) {
  const q = String(query || '').trim().toLowerCase();
  const out = [];
  for (const node of nodes || []) {
    if (epicId && node.workType === 'epic' && entityId(node.raw) !== epicId) continue;
    const children = filterTimelineTree(node.children, { query, epicId: '', type, status }, ctx);
    const raw = node.raw || {};
    const key = displayIssueKey(ctx.projectCode, entityId(raw)).toLowerCase();
    const title = String(node.title || raw.title || '').toLowerCase();
    const matchQuery = !q || title.includes(q) || key.includes(q);
    const matchType = !type || String(node.workType || '').toLowerCase() === type;
    const matchStatus = !status || nodeStatusBucket(node, ctx.lists) === status;
    if ((matchQuery && matchType && matchStatus) || children.length) {
      out.push({ ...node, children });
    }
  }
  return out;
}

function monthShort(year, month, locale) {
  return new Date(year, month, 1).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    month: 'short',
  });
}

function quarterLabel(year, quarter, locale) {
  const startMonth = (Number(quarter) - 1) * 3;
  return `${monthShort(year, startMonth, locale)} - ${monthShort(year, startMonth + 2, locale)}`;
}

function groupHeaderLabel(group, locale) {
  if (group.scale === 'quarters') return String(group.year);
  return monthShort(group.year, group.month, locale);
}

function columnHeaderLabel(col, locale) {
  if (col.scale === 'weeks') return String(col.day);
  if (col.scale === 'quarters') return quarterLabel(col.year, col.quarter, locale);
  return monthShort(col.year, col.month, locale);
}

function TimelineCreateEpic({ busy = false, onCreate, t }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="mt-1 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {t('workspace.projectHubTimelineCreateEpic')}
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-background p-2 sm:flex-row sm:items-center">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('workspace.projectHubBacklogCreatePlanningPh')}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCreate?.(title);
            setTitle('');
            setOpen(false);
          }
        }}
      />
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
          onClick={() => {
            const text = String(title || '').trim();
            if (!text || busy) return;
            onCreate?.(text);
            setTitle('');
            setOpen(false);
          }}
          disabled={busy}
        >
          {t('workspace.projectHubPlanAdd')}
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-muted-foreground"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/**
 * Tab Timeline — cây Work + Gantt theo tuần/tháng/quý trong biên dự án.
 */
export default function ProjectHubTimelinePanel({
  projectId = '',
  boardId = '',
  defaultListId = '',
  lists = [],
  projectCode = '',
  hubCaps = null,
  canManage = false,
  apiCtx = null,
  isDarkMode = false,
  locale = 'en',
  workspaceSlug = '',
  board = null,
  projectPayload = null,
  cards = [],
  planningItems = [],
  planningLoading = false,
  planningError = false,
  sprints = [],
  onPatchPlanningItems = null,
  onReloadPlanning = null,
  onRefresh = null,
  onUpdateCard = null,
  onPatchBoardCards = null,
  timelineActive = true,
  workTypeConfig = null,
}) {
  const { t } = useAppStrings();
  const [scale, setScale] = useState('months');
  const [range, setRange] = useState(null);
  const [query, setQuery] = useState('');
  const [epicFilter, setEpicFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [detailIssue, setDetailIssue] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const syncingY = useRef(false);
  const pendingPrependPx = useRef(0);
  const extendingRef = useRef(false);

  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const bounds = useMemo(
    () => resolveProjectTimeBounds(projectPayload, board),
    [projectPayload, board]
  );
  const boundsKey = bounds ? `${bounds.start.getTime()}:${bounds.end.getTime()}` : '';

  useEffect(() => {
    setRange(buildInitialWindow(scale, new Date(), bounds));
  }, [scale, boundsKey, bounds]);

  const columns = useMemo(() => enumerateColumns(range, scale), [range, scale]);
  const columnOffsets = useMemo(() => {
    let x = 0;
    return columns.map((col) => {
      const offset = x;
      x += col.widthPx;
      return { key: col.key, left: offset };
    });
  }, [columns]);
  const groups = useMemo(() => groupTimelineColumns(columns), [columns]);
  const totalWidth = columnsTotalWidth(columns);
  const today = useMemo(() => new Date(), [scale, boundsKey]);
  const todayX = useMemo(() => todayOffsetPx(today, columns), [today, columns]);
  const showWeeksHeader = scale === 'weeks';

  const epics = useMemo(
    () => (planningItems || []).filter((i) => String(i.type || '').toLowerCase() === 'epic'),
    [planningItems]
  );
  const features = useMemo(
    () => (planningItems || []).filter((i) => String(i.type || '').toLowerCase() === 'feature'),
    [planningItems]
  );
  const tree = useMemo(
    () =>
      buildListTree({
        epics,
        features,
        cards,
        config: workTypeConfig,
      }),
    [epics, features, cards, workTypeConfig]
  );
  const filteredTree = useMemo(
    () =>
      filterTimelineTree(
        tree,
        { query, epicId: epicFilter, type: typeFilter, status: statusFilter },
        { projectCode, lists }
      ),
    [tree, query, epicFilter, typeFilter, statusFilter, projectCode, lists]
  );
  const flatRows = useMemo(
    () => flattenExpandedRows(filteredTree, expandedIds),
    [filteredTree, expandedIds]
  );

  const overlappingSprints = useMemo(() => {
    if (todayX == null) return [];
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const t0 = day.getTime();
    return (sprints || []).filter((s) => {
      const a = s?.startDate ? new Date(s.startDate).getTime() : NaN;
      const b = s?.endDate ? new Date(s.endDate).getTime() : NaN;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return a <= t0 && t0 <= b;
    });
  }, [sprints, todayX]);

  const selectCls =
    'rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground';

  const centerToday = useCallback(() => {
    const el = rightRef.current;
    if (!el || todayX == null) return;
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
  }, [todayX]);

  useEffect(() => {
    if (!timelineActive) return undefined;
    const id = requestAnimationFrame(centerToday);
    return () => cancelAnimationFrame(id);
  }, [timelineActive, scale, boundsKey, centerToday]);

  useLayoutEffect(() => {
    const el = rightRef.current;
    if (!el || !pendingPrependPx.current) return;
    el.scrollLeft += pendingPrependPx.current;
    pendingPrependPx.current = 0;
    extendingRef.current = false;
  }, [range]);

  const syncFromLeft = (event) => {
    if (syncingY.current) return;
    syncingY.current = true;
    if (rightRef.current) rightRef.current.scrollTop = event.currentTarget.scrollTop;
    syncingY.current = false;
  };

  const onRightScroll = (event) => {
    const el = event.currentTarget;
    if (!syncingY.current && leftRef.current) {
      syncingY.current = true;
      leftRef.current.scrollTop = el.scrollTop;
      syncingY.current = false;
    }
    if (extendingRef.current || !range || !bounds) return;
    if (el.scrollLeft <= TIMELINE_SCROLL_EDGE_PX) {
      const next = extendWindow(range, scale, 'prev', bounds);
      if (next.start.getTime() !== range.start.getTime()) {
        const oldW = columnsTotalWidth(columns);
        const newW = columnsTotalWidth(enumerateColumns(next, scale));
        pendingPrependPx.current = newW - oldW;
        extendingRef.current = true;
        setRange(next);
      }
      return;
    }
    const room = el.scrollWidth - el.clientWidth - el.scrollLeft;
    if (room <= TIMELINE_SCROLL_EDGE_PX) {
      const next = extendWindow(range, scale, 'next', bounds);
      if (next.end.getTime() !== range.end.getTime()) setRange(next);
    }
  };

  const toggleExpand = (nodeId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const createEpic = async (text) => {
    const title = String(text || '').trim();
    if (!title || createBusy || !projectId) return;
    setCreateBusy(true);
    try {
      const res = await projectAPI.createPlanningItem(projectId, { type: 'epic', title });
      const created = unwrapPlanningEntity(res);
      if (created) {
        onPatchPlanningItems?.((prev) => upsertById(prev, { ...created, type: 'epic', title }));
      } else {
        onReloadPlanning?.();
      }
      toast.success(t('workspace.projectHubPlanCreated'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubTimelineLoadFail') }));
    } finally {
      setCreateBusy(false);
    }
  };

  const bodyH = Math.max(flatRows.length * TIMELINE_ROW_PX, TIMELINE_ROW_PX);

  if (planningError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <p className={`text-sm ${titleCls}`}>{t('workspace.projectHubTimelineLoadFail')}</p>
        <button
          type="button"
          onClick={() => onReloadPlanning?.()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
        >
          <RefreshCw size={14} aria-hidden />
          {t('workspace.projectHubTimelineRetry')}
        </button>
      </div>
    );
  }

  if (!bounds) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <p className={`text-sm ${muted}`}>{t('workspace.projectHubTimelineNoDates')}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={planningLoading || undefined}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <label className="relative min-w-[10rem] flex-1">
          <Search size={14} className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 ${muted}`} aria-hidden />
          <span className="sr-only">{t('workspace.projectHubTimelineSearchPh')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workspace.projectHubTimelineSearchPh')}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground"
          />
        </label>
        <select
          className={selectCls}
          value={epicFilter}
          onChange={(e) => setEpicFilter(e.target.value)}
          aria-label={t('workspace.projectHubTimelineFilterEpic')}
        >
          <option value="">{t('workspace.projectHubPlanAllEpics')}</option>
          {epics.map((epic) => (
            <option key={entityId(epic)} value={entityId(epic)}>
              {displayIssueKey(projectCode, entityId(epic))} {epic.title || ''}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label={t('workspace.projectHubTimelineFilterType')}
        >
          <option value="">{t('workspace.projectHubTimelineFilterType')}</option>
          {TYPE_FILTERS.map((id) => (
            <option key={id} value={id}>
              {t(TYPE_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t('workspace.projectHubTimelineFilterStatus')}
        >
          <option value="">{t('workspace.projectHubTimelineFilterStatus')}</option>
          {STATUS_FILTERS.map((id) => (
            <option key={id} value={id}>
              {t(STATUS_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex shrink-0 flex-col border-r border-border" style={{ width: WORK_COL_PX }}>
          <div
            className="flex shrink-0 items-end border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ height: HEADER_PX }}
          >
            {t('workspace.projectHubTimelineWork')}
          </div>
          <div ref={leftRef} className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto" onScroll={syncFromLeft}>
            {planningLoading && !flatRows.length ? (
              <p className={`px-3 py-4 text-xs ${muted}`}>{t('common.loading')}</p>
            ) : null}
            {!planningLoading && !flatRows.length ? (
              <p className={`px-3 py-4 text-xs ${muted}`}>{t('workspace.projectHubTimelineEmpty')}</p>
            ) : null}
            {flatRows.map(({ node, depth }) => {
              const raw = node.raw || {};
              const canExpand = Array.isArray(node.children) && node.children.length > 0;
              const expanded = expandedIds.has(node.id);
              const bucket = nodeStatusBucket(node, lists);
              const assignee = resolveAssignee(raw);
              const stats =
                node.kind === 'planning'
                  ? childWorkStats(cards, entityId(raw), lists, node.workType)
                  : { total: 0, done: 0 };
              const pct = childWorkProgressPct(stats.done, stats.total);
              return (
                <div
                  key={node.id}
                  className="relative flex items-center gap-1 border-b border-border px-2"
                  style={{ height: TIMELINE_ROW_PX, paddingLeft: 8 + depth * 16 }}
                >
                  {canExpand ? (
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-expanded={expanded}
                      onClick={() => toggleExpand(node.id)}
                    >
                      {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => setDetailIssue(raw)}
                  >
                    <ProjectHubIssueTypeBadge
                      type={node.workType}
                      variant="icon"
                      label={t(TYPE_LABEL_KEYS[node.workType] || TYPE_LABEL_KEYS.task)}
                    />
                    <span className={`truncate text-xs font-medium ${titleCls}`}>
                      {displayIssueKey(projectCode, entityId(raw))} {node.title}
                    </span>
                  </button>
                  <span
                    className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusBucketPillClass(bucket)}`}
                  >
                    {t(STATUS_LABEL_KEYS[bucket] || STATUS_LABEL_KEYS.todo)}
                  </span>
                  {assignee ? (
                    <UserAvatar name={assignee.name} avatar={assignee.avatar} userId={assignee.userId} size="xs" />
                  ) : null}
                  {node.workType === 'epic' && stats.total > 0 ? (
                    <span
                      className="pointer-events-none absolute bottom-0 left-8 right-2 h-0.5 overflow-hidden rounded bg-muted"
                      style={{ marginLeft: depth * 16 }}
                    >
                      <span
                        className={`block h-full ${childWorkProgressBarClass(stats)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  ) : null}
                </div>
              );
            })}
            {hubCaps?.canCreateEpic ? (
              <TimelineCreateEpic busy={createBusy} onCreate={createEpic} t={t} />
            ) : null}
          </div>
        </div>

        <div
          ref={rightRef}
          className="scrollbar-overlay min-h-0 min-w-0 flex-1 overflow-auto"
          onScroll={onRightScroll}
        >
          <div className="relative" style={{ width: Math.max(totalWidth, 1), minHeight: '100%' }}>
            <div
              className="sticky top-0 z-20 border-b border-border bg-surface"
              style={{ height: HEADER_PX }}
            >
              {showWeeksHeader ? (
                <>
                  <div className="flex h-7 border-b border-border text-[11px] font-semibold text-muted-foreground">
                    {groups.map((g) => (
                      <div
                        key={g.key}
                        className="flex items-center border-r border-border px-1"
                        style={{ width: g.widthPx }}
                      >
                        {groupHeaderLabel(g, locale)}
                      </div>
                    ))}
                  </div>
                  <div className="flex h-7 text-[10px] text-muted-foreground">
                    {columns.map((col) => {
                      const isToday = isSameLocalDay(col.start, today);
                      return (
                        <div
                          key={col.key}
                          className={`flex items-center justify-center border-r border-border ${
                            isToday ? 'font-bold text-primary' : ''
                          }`}
                          style={{ width: col.widthPx }}
                        >
                          {columnHeaderLabel(col, locale)}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex h-full text-xs font-semibold text-muted-foreground">
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center border-r border-border px-2"
                      style={{ width: col.widthPx }}
                    >
                      {columnHeaderLabel(col, locale)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" style={{ height: bodyH + 24 }}>
              {columnOffsets.map((meta) => (
                <div
                  key={`grid-${meta.key}`}
                  className="absolute top-0 bottom-0 border-r border-border/60"
                  style={{ left: meta.left, width: 0 }}
                />
              ))}
              {(sprints || []).map((sprint) => {
                const place = sprintBarPlacement(sprint, columns);
                if (!place) return null;
                return (
                  <div
                    key={entityId(sprint) || sprint.name}
                    className="absolute top-1 h-1.5 rounded-full bg-success/70"
                    style={{ left: place.left, width: place.width }}
                    title={String(sprint.name || '')}
                  />
                );
              })}
              {todayX != null ? (
                <div
                  className="pointer-events-none absolute top-0 z-10 w-px bg-primary"
                  style={{ left: todayX, height: bodyH + 24 }}
                >
                  {overlappingSprints.length ? (
                    <span className="absolute left-1 top-0 max-w-[12rem] truncate rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {overlappingSprints.map((s) => s.name).filter(Boolean).join(', ')}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {flatRows.map(({ node }, index) => {
                const rangeItem = rangeForTimelineNode(node);
                const place = rangeItem ? barPlacement(rangeItem.start, rangeItem.end, columns) : null;
                return (
                  <div
                    key={`bar-${node.id}`}
                    className="absolute left-0 right-0"
                    style={{ top: 24 + index * TIMELINE_ROW_PX, height: TIMELINE_ROW_PX }}
                  >
                    {place ? (
                      <button
                        type="button"
                        className="absolute top-2 h-5 rounded-md bg-primary"
                        style={{ left: place.left, width: place.width }}
                        aria-label={node.title}
                        onClick={() => setDetailIssue(node.raw)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex justify-end">
        <div
          className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1 shadow-sm"
          role="group"
          aria-label={t('workspace.projectHubTimelineScaleAria')}
        >
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            onClick={centerToday}
            aria-label={t('workspace.projectHubTimelineTodayAria')}
          >
            {t('workspace.projectHubTimelineToday')}
          </button>
          {TIMELINE_SCALES.map((id) => {
            const active = scale === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setScale(id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  active ? 'border border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(SCALE_LABEL_KEYS[id])}
              </button>
            );
          })}
        </div>
      </div>

      <WorkItemDetail
        key={String(detailIssue?._id || detailIssue?.id || 'timeline-detail')}
        open={Boolean(detailIssue)}
        chrome="modal"
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        workItem={detailIssue}
        boardId={boardId}
        lists={lists}
        boardCards={cards}
        workTypeConfig={workTypeConfig}
        priorityConfig={projectPayload?.priorityConfig}
        projectCode={projectCode}
        projectId={projectId}
        defaultListId={defaultListId}
        apiCtx={apiCtx}
        initialPanel="detail"
        canCreateTask={Boolean(hubCaps?.canCreateTask || canManage)}
        canEstimate={Boolean(canManage || hubCaps?.canEstimate)}
        canComment={
          Boolean(canManage) ||
          (Array.isArray(hubCaps?.permissions) && hubCaps.permissions.includes('task:comment'))
        }
        canChangeStatus={
          Boolean(canManage) ||
          (Array.isArray(hubCaps?.permissions) && hubCaps.permissions.includes('task:change_status'))
        }
        onClose={() => setDetailIssue(null)}
        onOpenWorkItem={(card) => {
          if (card) setDetailIssue(card);
        }}
        onRefresh={onRefresh}
        onPatchBoardCards={onPatchBoardCards}
        onPatchPlanningItems={(updater) => {
          onPatchPlanningItems?.(updater);
          setDetailIssue((prev) => {
            if (!prev) return prev;
            const nextList = updater([prev]);
            const hit = (Array.isArray(nextList) ? nextList : []).find(
              (row) => String(row._id || row.id) === String(prev._id || prev.id)
            );
            return hit ? { ...prev, ...hit } : prev;
          });
        }}
        onUpdateCard={async (cardId, patch) => {
          await onUpdateCard?.(cardId, patch);
          setDetailIssue((prev) =>
            prev && String(prev._id) === String(cardId) ? { ...prev, ...patch } : prev
          );
        }}
      />
    </div>
  );
}
