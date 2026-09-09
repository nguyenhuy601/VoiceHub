import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_PROJECTS_LIST_MS } from '../../lib/queryClient';
import {
  taskAPI,
  unwrapTaskApiPayload,
} from '../../services/api/taskAPI';
import {
  mapProjectsToBoardPickerRows,
  mapBoardsToPickerRows,
} from '../../services/api/projectAPI';
import ProjectHubShell from '../../features/projects/hub/ProjectHubShell';
import {
  ensureProjectHubBoards,
  ensureProjectHubProject,
  useInvalidateProjectHub,
  useProjectHubBoardDetail,
} from '../../features/projects/hub/useProjectHubQueries';
import { resolveCardMutationCachePolicy } from '../../features/projects/hub/projectHubMutationCachePolicy';
import ProjectBoardPanel from '../../features/projects/board/ProjectBoardPanel';
import { kanbanCardSyncedExtra } from '../../features/projects/board/kanbanCardSyncedExtra';
import {
  boardQueryFromSearch,
  buildCollaborateProjectHubPath,
  buildCollaborateProjectsNewPath,
  buildCollaborateProjectsPath,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isHoursSoftWarning } from '../../utils/hoursSoftWarning';
import useTaskWorkspaceScope from '../../hooks/useTaskWorkspaceScope';
import { fetchOrgProjectsList } from '../../hooks/useOrgProjectsList';

export default function ProjectHubPage() {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidateProjectHub = useInvalidateProjectHub();
  const { projectId: projectIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const projectId = String(projectIdParam || '').trim();
  const orgIdFromQuery =
    orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();
  const boardIdFromQuery = boardQueryFromSearch(searchParams);
  const [orgId, setOrgId] = useState(orgIdFromQuery);

  useEffect(() => {
    setOrgId(orgIdFromQuery);
  }, [orgIdFromQuery]);

  useEffect(() => {
    if (orgIdFromQuery || !projectId) return undefined;
    let cancelled = false;
    ensureProjectHubProject(queryClient, projectId)
      .then((row) => {
        if (cancelled || !row) return;
        const next = String(
          row?.organizationId || row?.organization?._id || row?.organization || ''
        ).trim();
        if (next) setOrgId(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgIdFromQuery, projectId, queryClient]);

  const currentUserId = String(user?.id || user?._id || user?.userId || '').trim();
  const apiCtx = useMemo(
    () => ({
      organizationId: orgId ? String(orgId) : '',
      workspaceSlug: '',
    }),
    [orgId]
  );

  const [taskBoards, setTaskBoards] = useState([]);
  const [loadingTaskBoards, setLoadingTaskBoards] = useState(false);
  const [selectedTaskBoardId, setSelectedTaskBoardId] = useState('');
  const [accessibleTaskBoards, setAccessibleTaskBoards] = useState([]);
  const [projectBriefs, setProjectBriefs] = useState([]);
  const [loadingProjectBriefs, setLoadingProjectBriefs] = useState(false);
  const {
    scope: taskWorkspaceScopeRaw,
    loading: taskWorkspaceScopeLoading,
  } = useTaskWorkspaceScope(orgId);
  /** undefined = đang load (chưa có cache); null = không có scope */
  const taskWorkspaceScope = taskWorkspaceScopeLoading
    ? undefined
    : taskWorkspaceScopeRaw;

  const resolveSelectedBoardId = useCallback((list) => {
    const preferred = String(boardIdFromQuery || '').trim();
    if (preferred && list.some((b) => String(b._id) === preferred)) {
      return preferred;
    }
    if (projectId && list.some((b) => String(b.projectId || '') === projectId)) {
      const hit = list.find((b) => String(b.projectId || '') === projectId);
      return hit?._id ? String(hit._id) : '';
    }
    return list[0]?._id ? String(list[0]._id) : '';
  }, [boardIdFromQuery, projectId]);

  const applyBoardPickerList = useCallback(
    (list) => {
      setTaskBoards(list);
      setAccessibleTaskBoards(list);
      setSelectedTaskBoardId((prev) => {
        const next = resolveSelectedBoardId(list);
        return next || prev;
      });
    },
    [resolveSelectedBoardId]
  );

  const loadOrgTaskBoards = useCallback(async () => {
    if (!orgId) {
      setTaskBoards([]);
      setSelectedTaskBoardId('');
      return;
    }
    const listKey = queryKeys.projects.list(orgId, { excludeClosed: false });
    const cached = queryClient.getQueryData(listKey);
    if (Array.isArray(cached) && cached.length) {
      applyBoardPickerList(mapProjectsToBoardPickerRows(cached));
    } else {
      setLoadingTaskBoards(true);
    }
    try {
      const raw = await queryClient.fetchQuery({
        queryKey: listKey,
        queryFn: () => fetchOrgProjectsList(orgId, { excludeClosed: false }),
        staleTime: STALE_TIME_PROJECTS_LIST_MS,
      });
      applyBoardPickerList(mapProjectsToBoardPickerRows(Array.isArray(raw) ? raw : []));
    } catch (err) {
      if (!(Array.isArray(cached) && cached.length)) {
        setTaskBoards([]);
        toast.error(resolveApiErrorMessage(err, t('taskBoard.loadBoardFail')));
      }
    } finally {
      setLoadingTaskBoards(false);
    }
  }, [orgId, queryClient, applyBoardPickerList, t]);

  const loadProjectBoardsFast = useCallback(async () => {
    if (!orgId || !projectId) return false;
    setLoadingTaskBoards(true);
    try {
      const [boards, projectRow] = await Promise.all([
        ensureProjectHubBoards(queryClient, projectId, orgId),
        ensureProjectHubProject(queryClient, projectId).catch(() => null),
      ]);
      const list = mapBoardsToPickerRows(Array.isArray(boards) ? boards : [], {
        projectId,
        title: projectRow?.title,
        projectCode: projectRow?.projectCode,
        description: projectRow?.description,
        dueDate: projectRow?.dueDate,
        visibility: projectRow?.visibility,
        background: projectRow?.background,
        status: projectRow?.status,
      });
      if (!list.length) return false;
      applyBoardPickerList(list);
      return true;
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.loadBoardFail')));
      return false;
    } finally {
      setLoadingTaskBoards(false);
    }
  }, [orgId, projectId, queryClient, applyBoardPickerList, t]);

  /** Một lần getBoardDetail (full) — tránh lists + full song song trên overview. */
  const boardDetailQuery = useProjectHubBoardDetail(selectedTaskBoardId, apiCtx, {
    includeCards: true,
    enabled: Boolean(selectedTaskBoardId),
  });

  const taskBoardDetail = boardDetailQuery.data ?? null;
  const loadingTaskBoardDetail =
    Boolean(selectedTaskBoardId) && !taskBoardDetail && boardDetailQuery.isPending;
  const fullBoardCardsReady =
    Boolean(selectedTaskBoardId) && !boardDetailQuery.isPending && Boolean(taskBoardDetail);

  useEffect(() => {
    if (!boardDetailQuery.isError) return;
    toast.error(
      resolveApiErrorMessage(boardDetailQuery.error, t('taskBoard.loadBoardDetailFail'))
    );
  }, [boardDetailQuery.isError, boardDetailQuery.error, t]);

  const patchBoardDetailCache = useCallback(
    (updater) => {
      const bid = String(selectedTaskBoardId || '').trim();
      if (!bid) return;
      for (const scope of ['full', 'lists']) {
        const key = queryKeys.projectHub.boardDetail(bid, scope);
        queryClient.setQueryData(key, (prev) => {
          if (!prev) return prev;
          return typeof updater === 'function' ? updater(prev) : prev;
        });
      }
    },
    [queryClient, selectedTaskBoardId]
  );

  useEffect(() => {
    if (!orgId) {
      setTaskBoards([]);
      setSelectedTaskBoardId('');
      return undefined;
    }
    const pid = String(projectId || '').trim();
    const bid = String(boardIdFromQuery || '').trim();
    let cancelled = false;
    let idleHandle = null;
    let deferTimer = null;

    (async () => {
      if (pid && bid) {
        const ok = await loadProjectBoardsFast();
        if (cancelled) return;
        if (ok) {
          const scheduleOrgList = () => {
            if (cancelled) return;
            void loadOrgTaskBoards();
          };
          if (typeof requestIdleCallback === 'function') {
            idleHandle = requestIdleCallback(scheduleOrgList, { timeout: 3000 });
          } else {
            deferTimer = setTimeout(scheduleOrgList, 2000);
          }
          return;
        }
      }
      await loadOrgTaskBoards();
    })();

    return () => {
      cancelled = true;
      if (idleHandle != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle);
      }
      if (deferTimer) clearTimeout(deferTimer);
    };
  }, [orgId, projectId, boardIdFromQuery, loadProjectBoardsFast, loadOrgTaskBoards]);

  useEffect(() => {
    if (!orgId) {
      setProjectBriefs([]);
      setLoadingProjectBriefs(false);
      return undefined;
    }
    if (taskWorkspaceScope === undefined) return undefined;
    if (!taskWorkspaceScope) {
      setProjectBriefs([]);
      setLoadingProjectBriefs(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingProjectBriefs(true);
    taskAPI
      .listProjectBriefs(
        { organizationId: String(orgId), status: 'open' },
        { timeout: 4000, skipPermissionDeniedToast: true }
      )
      .then((res) => {
        if (cancelled) return;
        const payload = unwrapTaskApiPayload(res);
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
        setProjectBriefs(list);
      })
      .catch(() => {
        if (!cancelled) setProjectBriefs([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjectBriefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, taskWorkspaceScope]);

  useEffect(() => {
    const pid = String(projectId || '').trim();
    const bid = String(boardIdFromQuery || '').trim();
    if (!pid || bid || !orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const boards = await ensureProjectHubBoards(queryClient, pid, orgId);
        const main =
          (Array.isArray(boards) ? boards : []).find((b) => b && b.isActive !== false) ||
          boards?.[0];
        const nextBoardId = String(main?._id || '').trim();
        if (!cancelled && nextBoardId) {
          navigate(
            buildCollaborateProjectHubPath(pid, { organizationId: orgId, boardId: nextBoardId }),
            { replace: true }
          );
        }
      } catch {
        /* hub empty until user picks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, boardIdFromQuery, orgId, navigate, queryClient]);

  useEffect(() => {
    if (!projectId || !selectedTaskBoardId) return;
    if (String(boardIdFromQuery || '') === String(selectedTaskBoardId)) return;
    navigate(
      buildCollaborateProjectHubPath(projectId, {
        organizationId: orgId,
        boardId: selectedTaskBoardId,
      }),
      { replace: true }
    );
  }, [projectId, selectedTaskBoardId, orgId, boardIdFromQuery, navigate]);

  const refreshTaskBoardView = useCallback(async () => {
    if (!selectedTaskBoardId) return;
    const pid =
      projectId ||
      String(
        taskBoards.find((b) => String(b._id) === String(selectedTaskBoardId))?.projectId || ''
      ).trim();
    invalidateProjectHub(pid, selectedTaskBoardId, { organizationId: orgId });
    await boardDetailQuery.refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }, [
    selectedTaskBoardId,
    projectId,
    taskBoards,
    invalidateProjectHub,
    orgId,
    boardDetailQuery,
    queryClient,
  ]);

  const isSelectedProjectCompleted = ['closed', 'completed'].includes(
    String(
      taskBoardDetail?.board?.status ||
        taskBoards.find((b) => String(b._id) === String(selectedTaskBoardId))?.status ||
        ''
    )
      .trim()
      .toLowerCase()
  );

  const handleAddBoardList = async (title) => {
    if (!selectedTaskBoardId) return null;
    try {
      const res = await taskAPI.createBoardList(selectedTaskBoardId, { title }, apiCtx);
      const list = unwrapTaskApiPayload(res);
      if (list?._id) {
        patchBoardDetailCache((prev) => {
          const lists = [...(Array.isArray(prev.lists) ? prev.lists : []), list].sort(
            (a, b) => Number(a.order || 0) - Number(b.order || 0)
          );
          return { ...prev, lists };
        });
        return list;
      }
      await boardDetailQuery.refetch();
      return null;
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.addListFail')));
      throw err;
    }
  };

  const handleAddBoardCard = async (listId, cardData) => {
    if (!selectedTaskBoardId) return;
    try {
      const res = await taskAPI.createBoardCard(selectedTaskBoardId, cardData, apiCtx);
      const card = unwrapTaskApiPayload(res);
      if (!card?._id) return;
      patchBoardDetailCache((prev) => {
        const cards = Array.isArray(prev.cards) ? [...prev.cards, card] : [card];
        const lists = Array.isArray(prev.lists)
          ? prev.lists.map((l) =>
              String(l._id) === String(listId)
                ? { ...l, cardCount: Number(l.cardCount || 0) + 1 }
                : l
            )
          : prev.lists;
        return { ...prev, cards, lists };
      });
      invalidateProjectHub(projectId, selectedTaskBoardId);
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.addCardFail')));
    }
  };

  const handleMoveBoardCard = async (cardId, toListId, index, ownerTeamId) => {
    if (!cardId || !toListId || !selectedTaskBoardId) return;
    try {
      const payload = { toListId: String(toListId) };
      if (index != null && Number.isFinite(Number(index))) {
        payload.index = Number(index);
      }
      if (ownerTeamId !== undefined) {
        payload.ownerTeamId = ownerTeamId;
      }
      const res = await taskAPI.moveBoardCard(String(cardId), payload, apiCtx);
      const moved = unwrapTaskApiPayload(res);
      if (moved?.approvalPending) {
        toast(t('taskBoard.approvalPendingToast'), { icon: '⏳' });
        patchBoardDetailCache((prev) => {
          if (!prev?.cards) return prev;
          const cards = prev.cards.map((c) => {
            if (String(c._id) !== String(cardId)) return c;
            return {
              ...c,
              ...(moved && typeof moved === 'object' ? moved : {}),
              status: 'awaiting_approval',
              listId: c.listId,
            };
          });
          return { ...prev, cards };
        });
        return;
      }
      patchBoardDetailCache((prev) => {
        if (!prev?.cards) return prev;
        const cards = prev.cards.map((c) => {
          if (String(c._id) !== String(cardId)) return c;
          return {
            ...c,
            listId: toListId,
            ...(ownerTeamId !== undefined ? { ownerTeamId } : {}),
            ...(moved && typeof moved === 'object' ? moved : {}),
          };
        });
        return { ...prev, cards };
      });
      const moveCache = resolveCardMutationCachePolicy('move');
      if (moveCache.fullInvalidate) {
        invalidateProjectHub(projectId, selectedTaskBoardId);
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      } else if (moveCache.overviewInvalidate && projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.overview(projectId) });
      }
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.moveCardFail')));
      throw err;
    }
  };

  const handleUpdateBoardCard = async (cardId, updates) => {
    if (!cardId || !selectedTaskBoardId) return;
    try {
      const res = await taskAPI.updateBoardCard(String(cardId), updates || {}, apiCtx);
      const updated = unwrapTaskApiPayload(res);
      if (updated?.approvalPending) {
        toast(t('taskBoard.approvalPendingToast'), { icon: '⏳' });
      }
      patchBoardDetailCache((prev) => {
        if (!prev?.cards) return prev;
        const cards = prev.cards.map((c) =>
          String(c._id) === String(cardId)
            ? {
                ...c,
                ...(updates || {}),
                ...(updated && typeof updated === 'object' ? updated : {}),
                ...(updated?.approvalPending
                  ? { status: 'awaiting_approval', listId: c.listId }
                  : {}),
              }
            : c
        );
        return { ...prev, cards };
      });
      const updateCache = resolveCardMutationCachePolicy('update');
      if (updateCache.fullInvalidate) {
        invalidateProjectHub(projectId, selectedTaskBoardId);
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      }
    } catch (err) {
      if (!isHoursSoftWarning(err)) {
        toast.error(resolveApiErrorMessage(err, t('taskBoard.updateCardFail')));
      }
      throw err;
    }
  };

  const applyBoardCardsPatch = useCallback(
    (updater) => {
      patchBoardDetailCache((prev) => {
        const current = Array.isArray(prev.cards) ? prev.cards : [];
        const nextCards = typeof updater === 'function' ? updater(current) : current;
        if (!Array.isArray(nextCards) || nextCards === current) return prev;
        return { ...prev, cards: nextCards };
      });
    },
    [patchBoardDetailCache]
  );

  const handleReorderBoardList = useCallback(
    async (listId, position) => {
      if (!selectedTaskBoardId || !listId) return;
      let rollbackLists = null;
      try {
        patchBoardDetailCache((prev) => {
          if (!prev?.lists) return prev;
          const source = [...prev.lists];
          rollbackLists = source;
          const ids = source.map((l) => String(l._id));
          const fromIdx = ids.indexOf(String(listId));
          if (fromIdx < 0) return prev;
          const next = source.filter((l) => String(l._id) !== String(listId));
          const targetIdx = Math.max(0, Math.min(Number(position || 1) - 1, next.length));
          next.splice(targetIdx, 0, source[fromIdx]);
          return {
            ...prev,
            lists: next.map((l, idx) => ({ ...l, order: (idx + 1) * 1000 })),
          };
        });
        await taskAPI.reorderBoardList(
          String(selectedTaskBoardId),
          String(listId),
          { position },
          apiCtx
        );
      } catch (err) {
        if (rollbackLists) {
          patchBoardDetailCache((prev) => (prev ? { ...prev, lists: rollbackLists } : prev));
        }
        toast.error(resolveApiErrorMessage(err, t('taskBoard.reorderListFail')));
      }
    },
    [selectedTaskBoardId, apiCtx, t, patchBoardDetailCache]
  );

  const canCreateWorkspaceTask = Boolean(taskWorkspaceScope?.canCreateTask);
  const canUseAiWorkspaceTask = Boolean(
    taskWorkspaceScope?.canUseAiTask ?? taskWorkspaceScope?.canCreateTask
  );
  const myAssignedProjectBriefs = useMemo(() => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return [];
    return (projectBriefs || []).filter((b) => String(b?.assigneePmId || '') === uid);
  }, [projectBriefs, currentUserId]);
  const oversightProjectBriefs = useMemo(() => {
    const uid = String(currentUserId || '').trim();
    return (projectBriefs || []).filter((b) => String(b?.assigneePmId || '') !== uid);
  }, [projectBriefs, currentUserId]);

  const openProjectSetupWizard = useCallback(
    (opts = {}) => {
      if (!orgId) {
        toast.error(t('organizations.selectOrgFirst'));
        return;
      }
      if (!canCreateWorkspaceTask) {
        toast.error(t('taskBoard.createBoardDenied'));
        return;
      }
      navigate(
        buildCollaborateProjectsNewPath(orgId, {
          from: 'hub',
          title: opts.title || '',
          description: opts.description || '',
          projectCode: opts.projectCode || '',
          briefId: opts.briefId || '',
        })
      );
    },
    [canCreateWorkspaceTask, navigate, orgId, t]
  );

  const openCreateBoardFromBrief = useCallback(
    (brief) => {
      if (!brief?._id) return;
      openProjectSetupWizard({
        title: brief.title || '',
        description: brief.body || '',
        projectCode: brief.projectCode || '',
        briefId: String(brief._id),
      });
    },
    [openProjectSetupWizard]
  );

  const boardCapabilities = taskBoardDetail?.capabilities || null;
  const canManageListsUi =
    Boolean(boardCapabilities?.canManageLists ?? canCreateWorkspaceTask) &&
    !isSelectedProjectCompleted;
  const canCreateCardsUi =
    Boolean(boardCapabilities?.canCreateCards ?? canCreateWorkspaceTask) &&
    !isSelectedProjectCompleted;
  const canManageMembersUi = Boolean(
    boardCapabilities?.canManageMembers ?? boardCapabilities?.canManageBoard
  );
  const canUpdateSettingsUi = Boolean(
    boardCapabilities?.canUpdateSettings ?? boardCapabilities?.canManageBoard
  );

  const renderTaskBoardPanel = (hideIdentityHeader = false) => (
    <ProjectBoardPanel
      isDarkMode={isDarkMode}
      workspaceSlug=""
      boards={taskBoards}
      accessibleBoards={accessibleTaskBoards}
      selectedBoardId={selectedTaskBoardId}
      boardDetail={taskBoardDetail}
      boardBackground={
        taskBoardDetail?.board?.background ||
        taskBoards.find((b) => String(b._id) === String(selectedTaskBoardId))?.background ||
        ''
      }
      loadingBoards={loadingTaskBoards}
      loadingBoardDetail={loadingTaskBoardDetail}
      currentUserId={currentUserId}
      teamsInScope={[]}
      onAddList={handleAddBoardList}
      onAddCard={handleAddBoardCard}
      onMoveCard={handleMoveBoardCard}
      onUpdateCard={handleUpdateBoardCard}
      onBoardCardsPatch={(updater) => {
        patchBoardDetailCache((prev) => {
          const cards = typeof updater === 'function' ? updater(prev.cards || []) : prev.cards;
          return { ...prev, cards: Array.isArray(cards) ? cards : prev.cards };
        });
      }}
      onReorderList={handleReorderBoardList}
      onRefresh={refreshTaskBoardView}
      onCreateBoard={canCreateWorkspaceTask ? () => openProjectSetupWizard() : undefined}
      canCreateBoard={canCreateWorkspaceTask}
      boardCapabilities={boardCapabilities}
      canManageLists={canManageListsUi}
      canCreateCards={canCreateCardsUi}
      organizationId={orgId || ''}
      canUseAiAssign={canUseAiWorkspaceTask && canCreateCardsUi}
      onAiAssignComplete={refreshTaskBoardView}
      renderCardExtra={(card) => kanbanCardSyncedExtra(card, [])}
      taskWorkspaceScope={taskWorkspaceScope}
      hideIdentityHeader={hideIdentityHeader}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {myAssignedProjectBriefs.length > 0 ? (
        <div className="mb-3 shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-amber-100">
            {t('taskBoard.briefBannerTitle')}
            {loadingProjectBriefs ? '…' : ''}
          </div>
          <ul className="space-y-1.5">
            {myAssignedProjectBriefs.map((brief) => (
              <li
                key={String(brief._id)}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-50/90"
              >
                <span className="min-w-0 truncate font-medium">{brief.title}</span>
                <button
                  type="button"
                  onClick={() => openCreateBoardFromBrief(brief)}
                  className="shrink-0 rounded-md border border-amber-300/40 bg-amber-400/15 px-2 py-1 font-semibold text-amber-50 hover:bg-amber-400/25"
                >
                  {t('taskBoard.briefOpenBoard')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {oversightProjectBriefs.length > 0 ? (
        <div className="mb-3 shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-amber-100">
            {t('taskBoard.briefBannerTitleOversight')}
            {loadingProjectBriefs ? '…' : ''}
          </div>
          <ul className="space-y-1.5">
            {oversightProjectBriefs.map((brief) => (
              <li
                key={String(brief._id)}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-50/90"
              >
                <span className="min-w-0 truncate font-medium">{brief.title}</span>
                <span className="shrink-0 text-[11px] text-amber-200/80">
                  {t('taskBoard.briefWaitingPm')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ProjectHubShell
        boardId={selectedTaskBoardId}
        projectId={
          projectId ||
          String(
            taskBoards.find((b) => String(b._id) === String(selectedTaskBoardId))?.projectId || ''
          ).trim()
        }
        boardDetail={taskBoardDetail}
        loadingBoardDetail={loadingTaskBoardDetail}
        boards={taskBoards}
        isDarkMode={isDarkMode}
        locale={locale}
        canManage={canManageMembersUi || canUpdateSettingsUi}
        organizationId={orgId || ''}
        apiCtx={apiCtx}
        onRefresh={refreshTaskBoardView}
        boardCardsReady={fullBoardCardsReady}
        onUpdateCard={handleUpdateBoardCard}
        onPatchBoardCards={applyBoardCardsPatch}
        workspaceSlug=""
        boardSlot={renderTaskBoardPanel(true)}
        emptySlot={renderTaskBoardPanel(false)}
        onBack={() => navigate(buildCollaborateProjectsPath(orgId))}
        onBoardChange={setSelectedTaskBoardId}
        currentUserId={currentUserId}
      />
    </div>
  );
}
