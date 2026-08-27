import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { queryKeys } from '../../lib/queryKeys';
import {
  taskAPI,
  unwrapTaskApiPayload,
  unwrapTaskBoardDetailPayload,
} from '../../services/api/taskAPI';
import { projectAPI, mapProjectsToBoardPickerRows } from '../../services/api/projectAPI';
import ProjectHubShell from '../../features/projects/hub/ProjectHubShell';
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
import { organizationAPI } from '../../services/api/organizationAPI';

function unwrapOrgIdFromProject(payload) {
  const row = payload?.data?.data ?? payload?.data ?? payload;
  return String(
    row?.organizationId || row?.organization?._id || row?.organization || ''
  ).trim();
}

export default function ProjectHubPage() {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    projectAPI
      .get(projectId)
      .then((res) => {
        if (cancelled) return;
        const next = unwrapOrgIdFromProject(res);
        if (next) setOrgId(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgIdFromQuery, projectId]);

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
  const [taskBoardDetail, setTaskBoardDetail] = useState(null);
  const [loadingTaskBoardDetail, setLoadingTaskBoardDetail] = useState(false);
  const [accessibleTaskBoards, setAccessibleTaskBoards] = useState([]);
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState(undefined);
  const [projectBriefs, setProjectBriefs] = useState([]);
  const [loadingProjectBriefs, setLoadingProjectBriefs] = useState(false);

  const loadTaskBoards = useCallback(async () => {
    if (!orgId) {
      setTaskBoards([]);
      setSelectedTaskBoardId('');
      setTaskBoardDetail(null);
      return;
    }
    setLoadingTaskBoards(true);
    try {
      const res = await projectAPI.list({ organizationId: orgId });
      const payload = unwrapTaskApiPayload(res);
      const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      const list = mapProjectsToBoardPickerRows(raw);
      setTaskBoards(list);
      setAccessibleTaskBoards(list);
      const preferred = String(boardIdFromQuery || '').trim();
      if (preferred && list.some((b) => String(b._id) === preferred)) {
        setSelectedTaskBoardId(preferred);
      } else if (projectId && list.some((b) => String(b.projectId || '') === projectId)) {
        const hit = list.find((b) => String(b.projectId || '') === projectId);
        setSelectedTaskBoardId(hit?._id ? String(hit._id) : '');
      } else {
        setSelectedTaskBoardId(list[0]?._id ? String(list[0]._id) : '');
      }
    } catch (err) {
      setTaskBoards([]);
      toast.error(resolveApiErrorMessage(err, t('taskBoard.loadBoardFail')));
    } finally {
      setLoadingTaskBoards(false);
    }
  }, [orgId, boardIdFromQuery, projectId, t]);

  const loadTaskBoardDetail = useCallback(
    async (boardId, options = {}) => {
      const silent = Boolean(options?.silent);
      if (!boardId) {
        setTaskBoardDetail(null);
        return;
      }
      if (!silent) setLoadingTaskBoardDetail(true);
      try {
        const res = await taskAPI.getBoardDetail(String(boardId), apiCtx);
        setTaskBoardDetail(unwrapTaskBoardDetailPayload(res));
      } catch (err) {
        if (!silent) setTaskBoardDetail(null);
        toast.error(resolveApiErrorMessage(err, t('taskBoard.loadBoardDetailFail')));
      } finally {
        if (!silent) setLoadingTaskBoardDetail(false);
      }
    },
    [apiCtx, t]
  );

  useEffect(() => {
    loadTaskBoards();
  }, [loadTaskBoards]);

  useEffect(() => {
    if (!orgId) {
      setTaskWorkspaceScope(null);
      return undefined;
    }
    let cancelled = false;
    setTaskWorkspaceScope(undefined);
    organizationAPI
      .getTaskWorkspaceScope(orgId)
      .then((res) => {
        if (cancelled) return;
        setTaskWorkspaceScope(res?.data?.data ?? res?.data ?? res ?? null);
      })
      .catch(() => {
        if (!cancelled) setTaskWorkspaceScope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setProjectBriefs([]);
      setLoadingProjectBriefs(false);
      return undefined;
    }
    // undefined = đang load scope — chờ; null = không có scope → bỏ briefs (tránh 403 treo).
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
        const res = await projectAPI.listBoards(pid, orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        const boards = Array.isArray(data) ? data : data?.items || [];
        const main = boards.find((b) => b && b.isActive !== false) || boards[0];
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
  }, [projectId, boardIdFromQuery, orgId, navigate]);

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

  useEffect(() => {
    loadTaskBoardDetail(selectedTaskBoardId);
  }, [selectedTaskBoardId, loadTaskBoardDetail]);

  const refreshTaskBoardView = useCallback(async () => {
    if (!selectedTaskBoardId) return;
    await loadTaskBoardDetail(selectedTaskBoardId, { silent: true });
  }, [selectedTaskBoardId, loadTaskBoardDetail]);

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
        setTaskBoardDetail((prev) => {
          if (!prev) return prev;
          const lists = [...(Array.isArray(prev.lists) ? prev.lists : []), list].sort(
            (a, b) => Number(a.order || 0) - Number(b.order || 0)
          );
          return { ...prev, lists };
        });
        return list;
      }
      await loadTaskBoardDetail(selectedTaskBoardId);
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
      setTaskBoardDetail((prev) => {
        if (!prev) return prev;
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
        setTaskBoardDetail((prev) => {
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
      setTaskBoardDetail((prev) => {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
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
      setTaskBoardDetail((prev) => {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    } catch (err) {
      if (!isHoursSoftWarning(err)) {
        toast.error(resolveApiErrorMessage(err, t('taskBoard.updateCardFail')));
      }
      throw err;
    }
  };

  const applyBoardCardsPatch = useCallback((updater) => {
    setTaskBoardDetail((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.cards) ? prev.cards : [];
      const nextCards = typeof updater === 'function' ? updater(current) : current;
      if (!Array.isArray(nextCards) || nextCards === current) return prev;
      return { ...prev, cards: nextCards };
    });
  }, []);

  const handleReorderBoardList = useCallback(
    async (listId, position) => {
      if (!selectedTaskBoardId || !listId) return;
      let rollbackLists = null;
      try {
        setTaskBoardDetail((prev) => {
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
          setTaskBoardDetail((prev) => (prev ? { ...prev, lists: rollbackLists } : prev));
        }
        toast.error(resolveApiErrorMessage(err, t('taskBoard.reorderListFail')));
      }
    },
    [selectedTaskBoardId, apiCtx, t]
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
        setTaskBoardDetail((prev) => {
          if (!prev) return prev;
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
