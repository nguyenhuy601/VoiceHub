import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ExternalLink, FileText, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { resolveHubCapabilities } from '../../../features/projectHub/hubCaps';
import ProjectHubMembersPanel from './ProjectHubMembersPanel';
import ProjectHubSettingsPanel from './ProjectHubSettingsPanel';
import ProjectHubPlanningPanel from './ProjectHubPlanningPanel';
import ProjectHubListPanel from './ProjectHubListPanel';
import { isBoardSprintReady } from './projectHubHierarchy';
import {
  PROJECT_HUB_TABS,
  collectCardActivity,
  collectCardAttachments,
  computeHubBoardSummary,
  countCardsByIssueType,
  formatHubDate,
  projectInitials,
  resolveActiveSprint,
  unwrapPlanningList,
} from './projectHubUtils';

function OverviewPanel({
  board,
  summary,
  issueCounts = { story: 0, task: 0, bug: 0 },
  activity,
  locale,
  isDarkMode,
  onOpenBoard,
  onOpenBacklog,
  t,
}) {
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const cardCls = 'rounded-xl border border-border bg-surface p-4';

  const nextActions = useMemo(() => {
    return (activity || [])
      .filter((a) => {
        const s = String(a.status || '').toLowerCase();
        return !s.includes('done') && !s.includes('complete');
      })
      .slice(0, 5);
  }, [activity]);

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabOverview')}</h3>
          <p className={`text-xs ${muted}`}>{t('workspace.projectHubOverviewHint')}</p>
          {board?.status ? (
            <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
              {board.status}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenBacklog}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
          >
            {t('workspace.projectHubOpenBacklog')}
          </button>
          <button
            type="button"
            onClick={onOpenBoard}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <LayoutGrid size={14} />
            {t('workspace.projectHubOpenBoard')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className={cardCls}>
          <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubDeliveryPulse')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              [String(summary.total), t('workspace.projectHubStatCards')],
              [`${summary.donePercent}%`, t('workspace.projectHubStatDone')],
              [String(summary.overdue), t('workspace.projectHubStatOverdue')],
            ].map(([v, l]) => (
              <div
                key={l}
                className="rounded-lg border border-border bg-background px-2 py-3 text-center"
              >
                <div className={`text-lg font-bold ${titleCls}`}>{v}</div>
                <div className={`text-[10px] ${muted}`}>{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              [String(issueCounts.story || 0), t('workspace.projectHubStatStories')],
              [String(issueCounts.task || 0), t('workspace.projectHubStatTasks')],
              [String(issueCounts.bug || 0), t('workspace.projectHubStatBugs')],
            ].map(([v, l]) => (
              <div
                key={l}
                className="rounded-lg border border-dashed border-border bg-background px-2 py-2 text-center"
              >
                <div className={`text-sm font-bold ${titleCls}`}>{v}</div>
                <div className={`text-[10px] ${muted}`}>{l}</div>
              </div>
            ))}
          </div>
          {board?.description ? (
            <p className={`mt-3 line-clamp-4 text-sm ${muted}`}>{board.description}</p>
          ) : (
            <p className={`mt-3 text-sm ${muted}`}>{t('workspace.projectHubNoDescription')}</p>
          )}
          <div className={`mt-3 flex flex-wrap gap-2 text-xs ${muted}`}>
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
              <Calendar size={12} />
              {t('workspace.projectHubFieldDue')}: {formatHubDate(board?.dueDate, locale)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {board?.visibility === 'workspace'
                ? t('workspace.projectHubVisibilityWorkspace')
                : t('workspace.projectHubVisibilityPrivate')}
            </span>
          </div>
        </div>

        <div className={cardCls}>
          <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {t('workspace.projectHubNextActions')}
          </p>
          {nextActions.length === 0 ? (
            <p className={`text-sm ${muted}`}>{t('workspace.projectHubNextActionsEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {nextActions.map((a) => (
                <li
                  key={a.id}
                  className="border-b border-border pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className={`font-medium ${titleCls}`}>{a.title}</span>
                  {a.assigneeName ? (
                    <span className={`mt-0.5 block text-[11px] ${muted}`}>{a.assigneeName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={`${cardCls} mt-3`}>
        <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${muted}`}>
          {t('workspace.projectHubRecentActivity')}
        </p>
        {activity.length === 0 ? (
          <p className={`text-sm ${muted}`}>{t('workspace.projectHubActivityEmpty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className={`text-xs ${muted}`}>
                <span className={titleCls}>{a.title}</span>
                {' · '}
                {formatHubDate(a.at, locale)}
                {a.status ? ` · ${a.status}` : ''}
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

function ActivityPanel({ activity, locale, isDarkMode, t }) {
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h3 className={`mb-1 text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabActivity')}</h3>
      <p className={`mb-3 text-xs ${muted}`}>{t('workspace.projectHubActivityHint')}</p>
      {activity.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.projectHubActivityEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className={`text-sm font-semibold ${titleCls}`}>{a.title}</div>
              <div className={`mt-0.5 text-xs ${muted}`}>
                {formatHubDate(a.at, locale)}
                {a.assigneeName ? ` · ${a.assigneeName}` : ''}
                {a.status ? ` · ${a.status}` : ''}
              </div>
            </li>
          ))}
        </ul>
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
  onBoardChange = null,
}) {
  const { t } = useAppStrings();
  const [tab, setTab] = useState('overview');
  const [visitedTabs, setVisitedTabs] = useState(() => ({ overview: true }));
  const prevHubProjectIdRef = useRef('');
  const [membersEpoch, setMembersEpoch] = useState(0);
  const [apiActivity, setApiActivity] = useState(null);
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
  const boardReadyAppliedRef = useRef(false);

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
    setApiFiles(null);
    setPlanningLoading(false);
    setPlanningError(false);
    loadedPlanningProjectRef.current = '';
    planningFetchKeyRef.current = '';
    sprintsLoadedForRef.current = '';
    activityLoadedForRef.current = '';
    filesLoadedForRef.current = '';
    boardReadyAppliedRef.current = false;
  }

  const needsSprints = tab === 'planning' || tab === 'board';
  const needsPlanningItems = tab === 'list' || tab === 'planning' || tab === 'board';
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
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !needsSprints) return undefined;
    if (sprintsLoadedForRef.current === projectId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.listSprints(projectId);
        if (cancelled) return;
        setSprints(unwrapPlanningList(res));
        sprintsLoadedForRef.current = projectId;
      } catch {
        if (!cancelled) setSprints([]);
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
  const activeSprint = useMemo(() => resolveActiveSprint(sprints), [sprints]);
  const sprintFilterId =
    boardReady && activeSprint?._id ? String(activeSprint._id) : '';
  const boardEpics = useMemo(
    () =>
      (planningItems || []).filter(
        (item) =>
          String(item?.type || '').toLowerCase() === 'epic' && item?.isActive !== false
      ),
    [planningItems]
  );
  const canLinkEpic = Boolean(
    canManage || hubCaps?.canUpdateEpic || hubCaps?.canUpdateStory || hubCaps?.canUpdateBacklog
  );

  const handleLinkParent = useCallback(
    async (taskId, epicId) => {
      const id = String(taskId || '').trim();
      if (!projectId || !id) return;
      try {
        await projectAPI.linkTaskPlanning(projectId, id, { epicId: epicId || null });
        onPatchBoardCards?.((cards) =>
          (Array.isArray(cards) ? cards : []).map((c) =>
            String(c._id || c.id) === id ? { ...c, epicId: epicId || null } : c
          )
        );
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanLinkFail') })
        );
      }
    },
    [projectId, onPatchBoardCards, t]
  );

  const boardKanban = isValidElement(boardSlot)
    ? cloneElement(boardSlot, {
        sprintFilterId: sprintFilterId || undefined,
        defaultSprintId: sprintFilterId || undefined,
        hubSprintCard: {
          projectCode: resolvedBoard?.projectCode || '',
          epics: boardEpics,
          canLinkEpic,
          onLinkParent: handleLinkParent,
        },
      })
    : boardSlot;

  useEffect(() => {
    if (boardReadyAppliedRef.current) return;
    if (!projectId) return;
    boardReadyAppliedRef.current = true;
    if (!boardReady && tab === 'board') setTab('list');
  }, [projectId, boardReady, tab]);

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
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [tab]);

  const showListPanel = Boolean(visitedTabs.list);
  const showPlanningPanel = Boolean(visitedTabs.planning);
  const showMembersPanel = Boolean(visitedTabs.members) && hubCaps.canViewMembers;

  const cards = Array.isArray(boardDetail?.cards) ? boardDetail.cards : [];
  const lists = Array.isArray(boardDetail?.lists) ? boardDetail.lists : [];

  const summary = useMemo(() => computeHubBoardSummary(cards, lists), [cards, lists]);
  const issueCounts = useMemo(() => countCardsByIssueType(cards), [cards]);
  const defaultListId = String(lists[0]?._id || '').trim();
  const derivedFiles = useMemo(() => collectCardAttachments(cards), [cards]);
  const derivedActivity = useMemo(() => collectCardActivity(cards), [cards]);
  const files = Array.isArray(apiFiles) ? apiFiles : derivedFiles;
  const activity = Array.isArray(apiActivity) ? apiActivity : derivedActivity;

  useEffect(() => {
    if (!projectId || !needsActivity) return undefined;
    if (activityLoadedForRef.current === projectId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const actRes = await projectAPI.getActivity(projectId, { limit: 40 });
        if (cancelled) return;
        const act = actRes?.data?.data ?? actRes?.data ?? [];
        setApiActivity(
          (Array.isArray(act) ? act : []).map((a) => ({
            id: a._id,
            title: a.title || a.type,
            status: a.type,
            createdAt: a.createdAt,
            assigneeName: '',
          }))
        );
        activityLoadedForRef.current = projectId;
      } catch {
        if (!cancelled) setApiActivity(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, needsActivity]);

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

  const toolbar = (
    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {boards.length > 0 && onBoardChange ? (
        <select
          value={boardId || ''}
          onChange={(e) => onBoardChange(e.target.value)}
          className={`max-w-[200px] rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:border-primary ${
            isDarkMode
              ? 'border-white/15 bg-[#1a1d26] text-white'
              : 'border-border bg-surface text-foreground'
          }`}
          aria-label={t('taskBoard.selectBoardAria')}
        >
          <option value="">{t('taskBoard.selectBoard')}</option>
          {boards.map((b) => (
            <option key={b._id} value={String(b._id)}>
              {b.title}
            </option>
          ))}
        </select>
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
                {resolvedBoard.methodology}
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
            summary={summary}
            issueCounts={issueCounts}
            activity={activity}
            locale={locale}
            isDarkMode={isDarkMode}
            onOpenBoard={() => setTab('board')}
            onOpenBacklog={() => setTab('planning')}
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
            boardCards={cards}
            lists={lists}
            projectCode={resolvedBoard?.projectCode || ''}
            hubCaps={hubCaps}
            canManage={canManage}
            apiCtx={apiCtx}
            isDarkMode={isDarkMode}
            locale={locale}
            workspaceSlug={workspaceSlug}
            planningItems={planningItems}
            planningLoading={planningLoading}
            planningError={planningError}
            onPatchPlanningItems={patchPlanningItems}
            onReloadPlanning={reloadPlanning}
            onRefresh={onRefresh}
            onUpdateCard={onUpdateCard}
            onPatchBoardCards={onPatchBoardCards}
            onOpenSettings={() => setTab('settings')}
            listActive={tab === 'list'}
            membersEpoch={membersEpoch}
            workTypeConfig={projectPayload?.workTypeConfig}
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
            organizationId={organizationId}
            apiCtx={apiCtx}
            canManage={hubCaps.canManageSettings || canManage}
            isDarkMode={isDarkMode}
            onSaved={onRefresh}
            workTypeConfig={projectPayload?.workTypeConfig}
          />
        ) : null}
      </div>
    </div>
  );
}
