import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, Eye, GripVertical, MoreHorizontal, Pencil, Plus, Search, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import TaskBoardCardActionsMenu from './TaskBoardCardActionsMenu';
import TaskBoardCardDetailModal from './TaskBoardCardDetailModal';
import { allowedIssueTypesFromCaps } from '../../features/projectHub/hubCaps';
import { visibleCreateTypes } from './ProjectHub/projectWorkTypes';
import { useProjectWorkTypes } from './ProjectHub/useProjectWorkTypes';
import TaskBoardListActionsMenu from './TaskBoardListActionsMenu';
import { labelById, parseCardLabelIds } from './taskBoardCardLabels';
import { useAppStrings } from '../../locales/appStrings';
import { Modal } from '../Shared';
import aiTaskService from '../../services/aiTaskService';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const LIST_WIDTH = 'w-[272px]';
const LANE_LABEL_WIDTH = 'w-[140px] min-w-[140px]';

function cardOwnerTeamKey(card) {
  const id = String(card?.ownerTeamId || '').trim();
  return id || '__unassigned__';
}

function buildSwimlaneRows(teamsInScope, t) {
  const rows = (teamsInScope || [])
    .map((team) => {
      const id = String(team?._id || team?.id || '').trim();
      if (!id) return null;
      return {
        key: id,
        teamId: id,
        label: String(team?.name || '').trim() || id.slice(-6),
      };
    })
    .filter(Boolean);
  rows.push({
    key: '__unassigned__',
    teamId: null,
    label: t('taskBoard.swimlaneUnassigned'),
  });
  return rows;
}
const CARD_OVERLAY_WIDTH = 'w-[248px]';
const COLUMN_ENTER =
  'animate-[taskBoardColumnIn_280ms_ease-out] motion-reduce:animate-none';

const cardSortId = (cardId) => `card-${cardId}`;
const parseCardSortId = (id) => String(id).replace(/^card-/, '');
const listColId = (listId) => `list-col-${listId}`;
const listCardsDropId = (listId) => `list-cards-${listId}`;
const parseListColId = (id) => String(id).replace(/^list-col-/, '');
const parseListCardsDropId = (id) => String(id).replace(/^list-cards-/, '');

const SWIM_CELL_PREFIX = 'swim-cell-';
const swimCellDropId = (listId, laneKey) => `${SWIM_CELL_PREFIX}${listId}__${laneKey}`;
function parseSwimCellId(id) {
  const s = String(id || '');
  if (!s.startsWith(SWIM_CELL_PREFIX)) return null;
  const rest = s.slice(SWIM_CELL_PREFIX.length);
  const sep = rest.indexOf('__');
  if (sep < 0) return null;
  return { listId: rest.slice(0, sep), laneKey: rest.slice(sep + 2) };
}
function ownerTeamIdFromLaneKey(laneKey) {
  if (!laneKey || laneKey === '__unassigned__') return null;
  return String(laneKey);
}

function sortCardsByPosition(a, b) {
  const pa = Number(a?.position) || 0;
  const pb = Number(b?.position) || 0;
  if (pa !== pb) return pa - pb;
  return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
}

function assigneeInitials(person) {
  const base = String(person?.displayName || person?.name || person?.username || person?.avatar || '').trim();
  if (!base) {
    const tail = String(person?.userId || '').trim().slice(-2).toUpperCase();
    return tail || '??';
  }
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && parts[0].length <= 3) return parts[0].toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function cardAssignees(card) {
  const list = Array.isArray(card?.assignees) ? card.assignees : [];
  if (list.length > 0) {
    return list.map((m) => ({
      ...m,
      displayName: String(m?.displayName || m?.name || m?.username || card?.assigneeName || '').trim(),
    }));
  }
  if (card?.assigneeId) {
    return [
      {
        userId: String(card.assigneeId),
        displayName: String(card.assigneeName || '').trim(),
      },
    ];
  }
  return [];
}

function buildListMap(boardDetail, optimisticLists) {
  const lists = [
    ...(Array.isArray(boardDetail?.lists) ? boardDetail.lists : []),
    ...optimisticLists,
  ];
  const cards = Array.isArray(boardDetail?.cards) ? boardDetail.cards : [];
  const byList = new Map(lists.map((l) => [String(l._id), { ...l, cards: [] }]));
  for (const card of cards) {
    const key = String(card?.listId || '');
    if (!byList.has(key)) continue;
    byList.get(key).cards.push(card);
  }
  for (const list of byList.values()) {
    list.cards.sort(sortCardsByPosition);
  }
  return [...byList.values()].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function buildCardItemsByList(listMap) {
  const out = {};
  for (const list of listMap) {
    out[String(list._id)] = [...(list.cards || [])].sort(sortCardsByPosition);
  }
  return out;
}

function findCardContainer(cardId, itemsByList) {
  const cid = String(cardId);
  return Object.keys(itemsByList).find((listId) =>
    (itemsByList[listId] || []).some((c) => String(c._id) === cid)
  );
}

function normalizeListTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isDoneListTitle(title) {
  const n = normalizeListTitle(title);
  if (!n) return false;
  if (['xong', 'done', 'completed', 'hoan thanh'].includes(n)) return true;
  return n.endsWith(' xong') || n.startsWith('done');
}

function isReviewListTitle(title) {
  const n = normalizeListTitle(title);
  if (!n) return false;
  return (
    n === 'cho duyet' ||
    n === 'in review' ||
    n === 'review' ||
    n.includes('cho duyet') ||
    n.includes('in review')
  );
}

function isCardComplete(card, listTitle) {
  if (String(card?.status || '') === 'done') return true;
  return isDoneListTitle(listTitle);
}

/** Trễ hạn: có dueDate, đã qua cuối ngày due, và chưa Xong. */
function isCardOverdue(card, listTitle) {
  if (!card?.dueDate) return false;
  if (isCardComplete(card, listTitle)) return false;
  const due = new Date(card.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const endOfDueDay = new Date(due);
  endOfDueDay.setHours(23, 59, 59, 999);
  return endOfDueDay.getTime() < Date.now();
}

function computeBoardSummary(cards, lists) {
  const listById = new Map((lists || []).map((l) => [String(l._id), l]));
  let done = 0;
  let overdue = 0;
  let inReview = 0;
  const rows = Array.isArray(cards) ? cards : [];
  for (const card of rows) {
    const listTitle = listById.get(String(card?.listId || ''))?.title || '';
    const complete = isCardComplete(card, listTitle);
    if (complete) done += 1;
    else if (isCardOverdue(card, listTitle)) overdue += 1;
    if (!complete && isReviewListTitle(listTitle)) inReview += 1;
  }
  const total = rows.length;
  return {
    total,
    done,
    overdue,
    inReview,
    donePercent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function SwimlaneDropCell({
  listId,
  laneKey,
  listColumnShell,
  cardSortableIds,
  isOverHighlight,
  children,
  footer,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: swimCellDropId(listId, laneKey),
    data: { type: 'swim-cell', listId, laneKey },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${LIST_WIDTH} shrink-0 rounded-xl border ${listColumnShell} flex max-h-[280px] flex-col ${
        isOver || isOverHighlight ? 'ring-2 ring-cyan-400/50' : ''
      }`}
    >
      <div className="scrollbar-overlay min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        <SortableContext items={cardSortableIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
      {footer}
    </div>
  );
}

function KanbanListColumn({
  list,
  isDarkMode,
  listColumnShell,
  columnEnterClass,
  onMenuClick,
  cardSortableIds,
  isCardsOver,
  children,
}) {
  const { t } = useAppStrings();
  const listId = String(list._id);
  const { setNodeRef: setListDragRef, setActivatorNodeRef, attributes, listeners, transform, isDragging } =
    useDraggable({
      id: listColId(listId),
      data: { type: 'list', listId },
    });
  const { setNodeRef: setCardsDropRef } = useDroppable({
    id: listCardsDropId(listId),
    data: { type: 'list-cards', listId },
  });
  const { setNodeRef: setListColDropRef, isOver: isListColOver } = useDroppable({
    id: listColId(listId),
    data: { type: 'list-col', listId },
  });

  const setColumnRef = (node) => {
    setListDragRef(node);
    setListColDropRef(node);
  };

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 40 : undefined }
    : undefined;

  return (
    <div
      ref={setColumnRef}
      style={style}
      className={`${LIST_WIDTH} shrink-0 ${columnEnterClass} flex max-h-full flex-col rounded-xl border transition-shadow duration-300 ${listColumnShell} ${
        list.isOptimistic ? 'opacity-90' : ''
      } ${isListColOver || isCardsOver ? 'ring-2 ring-cyan-400/50' : ''} ${isDragging ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className={`shrink-0 cursor-grab rounded p-0.5 active:cursor-grabbing ${
            isDarkMode ? 'text-slate-500 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-200'
          }`}
          aria-label={t('taskBoard.dragListAria')}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{list.title}</h3>
        {list.isWatching || list.watcherCount > 0 ? (
          <span
            className={`flex items-center gap-0.5 text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
            title={t('taskBoard.watchersTitle')}
          >
            <Eye className="h-3 w-3" />
            {list.watcherCount > 0 ? list.watcherCount : ''}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick(e);
          }}
          className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
          aria-label={t('taskBoard.listActionsAria')}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div ref={setCardsDropRef} className="flex min-h-0 flex-1 flex-col">
        <SortableContext items={cardSortableIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  );
}

function KanbanSortableCard({
  card,
  isDarkMode,
  cardShell,
  onOpenDetail,
  onOpenMenu,
  onToggleComplete,
  renderCardBody,
}) {
  const id = cardSortId(card._id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'card', cardId: String(card._id), listId: String(card.listId) },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(card)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpenDetail(card);
        }}
        className={`group relative cursor-grab rounded-lg border px-2 py-2 text-xs transition-shadow hover:shadow-md active:cursor-grabbing ${cardShell}`}
      >
        {renderCardBody(card, { onOpenMenu, onToggleComplete })}
      </div>
    </div>
  );
}

export default function TaskBoardWorkspacePanel({
  isDarkMode,
  workspaceSlug = '',
  boards = [],
  accessibleBoards = [],
  selectedBoardId = '',
  boardDetail = null,
  boardBackground = '',
  loadingBoards = false,
  loadingBoardDetail = false,
  currentUserId = '',
  teamsInScope = [],
  onAddList,
  onAddCard,
  onMoveCard,
  onUpdateCard,
  onReorderList,
  onRefresh,
  onCreateBoard = null,
  canCreateBoard = false,
  boardCapabilities = null,
  canManageLists = false,
  canCreateCards = false,
  organizationId = '',
  canUseAiAssign = false,
  onAiAssignComplete = null,
  renderCardExtra = null,
  /** Tăng số này từ parent (nút Search header) để focus ô tìm thẻ trên board. */
  boardSearchFocusToken = 0,
  taskWorkspaceScope = null,
  /** Ẩn title/code/summary — Project Hub đã có identity header. */
  hideIdentityHeader = false,
}) {
  const { t, locale } = useAppStrings();
  const [optimisticLists, setOptimisticLists] = useState([]);
  const [addingListOpen, setAddingListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [submittingList, setSubmittingList] = useState(false);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [boardSearchQuery, setBoardSearchQuery] = useState('');
  const [boardSearchOpen, setBoardSearchOpen] = useState(false);
  const boardSearchInputRef = useRef(null);
  const [cardDraftByList, setCardDraftByList] = useState({});
  const [cardIssueTypeByList, setCardIssueTypeByList] = useState({});
  const [cardComposerOpen, setCardComposerOpen] = useState({});
  const hubProjectId = String(
    boardDetail?.board?.projectId || boards.find((b) => String(b._id) === String(selectedBoardId))?.projectId || ''
  ).trim();
  const { config: workTypeConfig } = useProjectWorkTypes(hubProjectId);
  const allowedIssueTypes = useMemo(() => {
    const fromCaps = allowedIssueTypesFromCaps(boardCapabilities);
    const base = fromCaps.length ? fromCaps : canCreateCards ? ['story', 'task', 'bug'] : [];
    return visibleCreateTypes(workTypeConfig, base);
  }, [boardCapabilities, canCreateCards, workTypeConfig]);
  const canCreateCardsEffective = canCreateCards || allowedIssueTypes.length > 0;
  const [menuList, setMenuList] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [cardMenuCard, setCardMenuCard] = useState(null);
  const [cardMenuAnchor, setCardMenuAnchor] = useState(null);
  const [detailCard, setDetailCard] = useState(null);
  const [detailPanel, setDetailPanel] = useState('detail');
  const [aiAssignOpen, setAiAssignOpen] = useState(false);
  const [aiAssignList, setAiAssignList] = useState(null);
  const [aiAssignDraftId, setAiAssignDraftId] = useState('');
  const [aiAssignItems, setAiAssignItems] = useState([]);
  const [aiAssignLoading, setAiAssignLoading] = useState(false);
  const [draggingListId, setDraggingListId] = useState('');
  const [draggingCard, setDraggingCard] = useState(null);
  const [cardItemsByList, setCardItemsByList] = useState({});
  const [cardsOverListId, setCardsOverListId] = useState('');
  const [swimlaneView, setSwimlaneView] = useState(false);
  const boardScrollRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    setOptimisticLists([]);
    setAddingListOpen(false);
    setNewListTitle('');
    setCardComposerOpen({});
    setCardDraftByList({});
    setShowMyTasksOnly(false);
    setBoardSearchQuery('');
    setBoardSearchOpen(false);
    // Mặc định bật swimlane khi phòng có ≥1 team (step 2 — chỉ đọc/group).
    setSwimlaneView(Array.isArray(teamsInScope) && teamsInScope.length > 0);
  }, [selectedBoardId, teamsInScope]);

  useEffect(() => {
    if (!boardSearchFocusToken) return;
    setBoardSearchOpen(true);
    requestAnimationFrame(() => {
      try {
        boardSearchInputRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
  }, [boardSearchFocusToken]);

  const activeBoardMeta = useMemo(() => {
    if (boardDetail?.board) return boardDetail.board;
    return boards.find((b) => String(b._id) === String(selectedBoardId)) || null;
  }, [boardDetail?.board, boards, selectedBoardId]);

  const filterCardsForView = useCallback(
    (cards) => {
      let next = Array.isArray(cards) ? cards : [];
      if (showMyTasksOnly && currentUserId) {
        next = next.filter((c) => String(c.assigneeId || '') === String(currentUserId));
      }
      const q = String(boardSearchQuery || '').trim().toLowerCase();
      if (q) {
        next = next.filter((c) => {
          const hay = `${c.title || ''} ${c.description || ''} ${c.summary || ''} ${c.assigneeName || ''}`.toLowerCase();
          return hay.includes(q);
        });
      }
      return next;
    },
    [showMyTasksOnly, currentUserId, boardSearchQuery]
  );

  useEffect(() => {
    if (!detailCard || !boardDetail?.cards) return;
    const fresh = boardDetail.cards.find((c) => String(c._id) === String(detailCard._id));
    if (fresh) setDetailCard(fresh);
  }, [boardDetail, detailCard?._id]);

  const listMap = useMemo(
    () => buildListMap(boardDetail, optimisticLists),
    [boardDetail, optimisticLists]
  );

  const workflowTransitionsByFrom = boardDetail?.workflow?.transitionsByFrom || null;
  const listStatusKeyById = useMemo(() => {
    const map = new Map();
    for (const l of listMap || []) {
      const key = String(l.statusKey || '').trim();
      if (key) map.set(String(l._id), key);
    }
    return map;
  }, [listMap]);

  const canTransitionLists = useCallback(
    (fromListId, toListId) => {
      if (!workflowTransitionsByFrom) return true;
      if (String(fromListId) === String(toListId)) return true;
      const fromKey = listStatusKeyById.get(String(fromListId));
      const toKey = listStatusKeyById.get(String(toListId));
      if (!fromKey || !toKey) return true;
      if (fromKey === toKey) return true;
      const edges = workflowTransitionsByFrom[fromKey] || [];
      return edges.some((e) => String(e.toKey) === toKey);
    },
    [workflowTransitionsByFrom, listStatusKeyById]
  );

  const boardSummary = useMemo(
    () =>
      computeBoardSummary(
        Array.isArray(boardDetail?.cards) ? boardDetail.cards : [],
        listMap
      ),
    [boardDetail?.cards, listMap]
  );

  const existingListTitles = useMemo(
    () => new Set(listMap.map((l) => String(l.title || '').trim().toLowerCase())),
    [listMap]
  );

  const teamListSuggestions = useMemo(() => {
    return (teamsInScope || [])
      .map((team) => {
        const name = String(team?.name || '').trim();
        if (!name) return null;
        const title = t('taskBoard.teamListTitle', { name });
        if (existingListTitles.has(title.trim().toLowerCase())) return null;
        return { teamId: String(team._id || team.id || ''), title };
      })
      .filter(Boolean);
  }, [teamsInScope, existingListTitles, t]);

  const canCreateTeamLists = false;

  const statusColumnTitles = useMemo(
    () => [
      t('taskBoard.statusColTodo'),
      t('taskBoard.statusColDoing'),
      t('taskBoard.statusColReview'),
      t('taskBoard.statusColDone'),
    ],
    [t]
  );

  const statusColumnSuggestions = useMemo(() => {
    return statusColumnTitles.filter(
      (title) => !existingListTitles.has(String(title || '').trim().toLowerCase())
    );
  }, [statusColumnTitles, existingListTitles]);

  const canCreateStatusColumns = canManageLists && statusColumnSuggestions.length > 0 && !submittingList;

  const swimlaneRows = useMemo(
    () => buildSwimlaneRows(teamsInScope, t),
    [teamsInScope, t]
  );
  const canUseSwimlane = Array.isArray(teamsInScope) && teamsInScope.length > 0;
  const showSwimlaneGrid = Boolean(swimlaneView && canUseSwimlane && listMap.length > 0);

  const cardsInSwimlaneCell = useCallback(
    (listId, laneKey) => {
      const listCards = filterCardsForView(cardItemsByList[String(listId)] || []);
      return listCards.filter((c) => cardOwnerTeamKey(c) === laneKey);
    },
    [cardItemsByList, filterCardsForView]
  );

  const handleCreateTeamLists = useCallback(async () => {
    if (!teamListSuggestions.length || submittingList) return;
    setSubmittingList(true);
    try {
      for (const item of teamListSuggestions) {
        await onAddList?.(item.title);
      }
    } finally {
      setSubmittingList(false);
    }
  }, [teamListSuggestions, submittingList, onAddList]);

  const handleCreateStatusColumns = useCallback(async () => {
    if (!statusColumnSuggestions.length || submittingList) return;
    setSubmittingList(true);
    try {
      for (const title of statusColumnSuggestions) {
        await onAddList?.(title);
      }
    } finally {
      setSubmittingList(false);
    }
  }, [statusColumnSuggestions, submittingList, onAddList]);

  const openAiAssign = useCallback(
    async (list) => {
      if (!canCreateCards || !canUseAiAssign || !organizationId || !selectedBoardId || !list?._id) {
        return;
      }
      setAiAssignList(list);
      setAiAssignOpen(true);
      setAiAssignLoading(true);
      setAiAssignItems([]);
      setAiAssignDraftId('');
      try {
        const res = await aiTaskService.suggestTeamCards(selectedBoardId, list._id, {
          organizationId: String(organizationId),
          listTitle: list.title,
          boardTitle: activeBoardMeta?.title || '',
          prompt: `${activeBoardMeta?.description || ''} — ${list.title}`,
        });
        const data = res?.data?.data || res?.data || {};
        setAiAssignDraftId(String(data.draftId || ''));
        setAiAssignItems(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (err) {
        toast.error(resolveApiErrorMessage(err, t('taskBoard.aiAssignFail')));
        setAiAssignOpen(false);
      } finally {
        setAiAssignLoading(false);
      }
    },
    [
      canCreateCards,
      canUseAiAssign,
      organizationId,
      selectedBoardId,
      activeBoardMeta?.title,
      activeBoardMeta?.description,
      t,
    ]
  );

  const confirmAiAssign = useCallback(async () => {
    if (!aiAssignDraftId || !aiAssignItems.length) return;
    setAiAssignLoading(true);
    try {
      await aiTaskService.confirmTeamAssignDraft(aiAssignDraftId, { items: aiAssignItems });
      toast.success(t('taskBoard.aiAssignSuccess'));
      setAiAssignOpen(false);
      onAiAssignComplete?.();
      onRefresh?.();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.aiAssignFail')));
    } finally {
      setAiAssignLoading(false);
    }
  }, [aiAssignDraftId, aiAssignItems, onAiAssignComplete, onRefresh, t]);

  const skipCardLayoutSyncRef = useRef(false);
  const cardDragSnapshotRef = useRef({
    cardId: '',
    listId: '',
    index: -1,
    ownerTeamId: undefined,
    originLaneKey: '',
    originListId: '',
  });

  useEffect(() => {
    if (skipCardLayoutSyncRef.current) return;
    if (!selectedBoardId || loadingBoardDetail || !boardDetail) {
      if (!selectedBoardId) setCardItemsByList({});
      return;
    }
    setCardItemsByList(buildCardItemsByList(listMap));
  }, [selectedBoardId, loadingBoardDetail, boardDetail, listMap]);

  const boardSurfaceStyle = useMemo(() => {
    if (!boardBackground || !String(boardBackground).trim()) return undefined;
    const bg = String(boardBackground).trim();
    if (bg.startsWith('linear-gradient') || bg.startsWith('url(')) {
      return { background: bg };
    }
    return { backgroundColor: bg };
  }, [boardBackground]);

  const handleSubmitNewList = useCallback(async () => {
    const title = String(newListTitle || '').trim();
    if (!title || submittingList) return;

    const tempId = `temp-list-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      title,
      order: (listMap.length + 1) * 1000,
      isOptimistic: true,
    };

    setOptimisticLists((prev) => [...prev, optimistic]);
    setNewListTitle('');
    setAddingListOpen(false);
    setSubmittingList(true);

    try {
      await onAddList?.(title);
      setOptimisticLists((prev) => prev.filter((l) => String(l._id) !== tempId));
    } catch {
      setOptimisticLists((prev) => prev.filter((l) => String(l._id) !== tempId));
      setAddingListOpen(true);
      setNewListTitle(title);
    } finally {
      setSubmittingList(false);
    }
  }, [newListTitle, submittingList, listMap.length, onAddList]);

  const listColumnShell = isDarkMode
    ? 'bg-[#22272b]/95 border-white/10 text-slate-100'
    : 'bg-slate-100/95 border-slate-200 text-slate-900';

  const cardShell = isDarkMode
    ? 'bg-[#2b3038] border-white/10 text-slate-100 shadow-sm'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';

  const boardsForMove = accessibleBoards.length ? accessibleBoards : boards;

  const handleListDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      setDraggingListId('');
      if (!over || !active) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (!activeId.startsWith('list-col-') || !overId.startsWith('list-col-')) return;
      const fromId = parseListColId(activeId);
      const toId = parseListColId(overId);
      if (fromId === toId) return;
      const toIndex = listMap.findIndex((l) => String(l._id) === toId);
      if (toIndex < 0) return;
      onReorderList?.(fromId, toIndex + 1);
    },
    [listMap, onReorderList]
  );

  const handleCardDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    if (!activeId.startsWith('card-')) return;
    skipCardLayoutSyncRef.current = true;
    const cardId = parseCardSortId(activeId);
    const listId = findCardContainer(cardId, cardItemsByList);
    const card = (cardItemsByList[listId] || []).find((c) => String(c._id) === cardId);
    if (card) setDraggingCard(card);
    setDraggingListId('');
    const laneKey = cardOwnerTeamKey(card);
    const idx = (cardItemsByList[listId] || []).findIndex((c) => String(c._id) === cardId);
    cardDragSnapshotRef.current = {
      cardId,
      listId: listId || '',
      index: idx,
      ownerTeamId: ownerTeamIdFromLaneKey(laneKey),
      originLaneKey: laneKey,
      originListId: listId || '',
    };
  }, [cardItemsByList]);

  const handleCardDragOver = useCallback((event) => {
    const { active, over } = event;
    if (!over || !active) return;
    const activeId = String(active.id);
    if (!activeId.startsWith('card-')) return;

    const activeCardId = parseCardSortId(activeId);
    const overId = String(over.id);
    const activeContainer = findCardContainer(activeCardId, cardItemsByList);
    let overContainer = '';
    if (overId.startsWith('list-cards-')) {
      overContainer = parseListCardsDropId(overId);
    } else if (overId.startsWith('card-')) {
      overContainer = findCardContainer(parseCardSortId(overId), cardItemsByList);
    }
    if (!activeContainer || !overContainer) return;
    setCardsOverListId(overContainer);

    if (activeContainer === overContainer && !overId.startsWith('list-cards-')) {
      const overCardId = parseCardSortId(overId);
      if (activeCardId === overCardId) return;
    }

    setCardItemsByList((prev) => {
      const activeItems = [...(prev[activeContainer] || [])];
      const overItems = activeContainer === overContainer ? activeItems : [...(prev[overContainer] || [])];
      const activeIndex = activeItems.findIndex((c) => String(c._id) === activeCardId);
      if (activeIndex < 0) return prev;

      let newIndex;
      if (overId.startsWith('list-cards-')) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.findIndex((c) => String(c._id) === parseCardSortId(overId));
        if (overIndex < 0) return prev;
        const isBelow =
          active.rect.current?.translated &&
          over.rect &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        newIndex = overIndex + (isBelow ? 1 : 0);
      }

      let nextState;
      if (activeContainer === overContainer) {
        if (newIndex > activeIndex) newIndex -= 1;
        if (newIndex === activeIndex) return prev;
        nextState = {
          ...prev,
          [activeContainer]: arrayMove(activeItems, activeIndex, newIndex),
        };
      } else {
        const itemsCopy = [...activeItems];
        const [moved] = itemsCopy.splice(activeIndex, 1);
        const nextOver = [...overItems];
        nextOver.splice(newIndex, 0, { ...moved, listId: overContainer });
        nextState = {
          ...prev,
          [activeContainer]: itemsCopy,
          [overContainer]: nextOver,
        };
      }

      const targetListId = activeContainer === overContainer ? activeContainer : overContainer;
      const targetIndex = (nextState[targetListId] || []).findIndex((c) => String(c._id) === activeCardId);
      if (targetIndex >= 0) {
        cardDragSnapshotRef.current = {
          cardId: activeCardId,
          listId: targetListId,
          index: targetIndex,
          ownerTeamId: undefined,
          originLaneKey: '',
        };
      }
      return nextState;
    });
  }, [cardItemsByList]);

  const handleCardDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      const activeCardId = parseCardSortId(String(active.id));
      setDraggingCard(null);
      setCardsOverListId('');

      const releaseCardLayoutLock = () => {
        skipCardLayoutSyncRef.current = false;
      };

      if (!over) {
        setCardItemsByList(buildCardItemsByList(listMap));
        releaseCardLayoutLock();
        return;
      }

      const snap = cardDragSnapshotRef.current;
      const listId =
        snap.cardId === activeCardId && snap.listId
          ? snap.listId
          : findCardContainer(activeCardId, cardItemsByList);
      const index =
        snap.cardId === activeCardId && snap.index >= 0
          ? snap.index
          : (cardItemsByList[listId] || []).findIndex((c) => String(c._id) === activeCardId);

      if (!listId || index < 0) {
        setCardItemsByList(buildCardItemsByList(listMap));
        releaseCardLayoutLock();
        return;
      }

      const ownerTeamId =
        snap.cardId === activeCardId && snap.ownerTeamId !== undefined
          ? snap.ownerTeamId
          : undefined;

      const originListId =
        snap.cardId === activeCardId && snap.originListId
          ? snap.originListId
          : (() => {
              const card = (listMap || [])
                .flatMap((l) => (l.cards || []).map((c) => ({ listId: l._id, card: c })))
                .find((row) => String(row.card._id) === activeCardId);
              return card ? String(card.listId) : '';
            })();

      if (originListId && listId && !canTransitionLists(originListId, listId)) {
        toast.error(t('workspace.workflowTransitionDenied'));
        setCardItemsByList(buildCardItemsByList(listMap));
        releaseCardLayoutLock();
        return;
      }

      try {
        await onMoveCard?.(activeCardId, listId, index, ownerTeamId);
        setDetailCard((prev) =>
          prev && String(prev._id) === activeCardId
            ? {
                ...prev,
                listId,
                ...(ownerTeamId !== undefined ? { ownerTeamId } : {}),
              }
            : prev
        );
      } catch {
        setCardItemsByList(buildCardItemsByList(listMap));
      } finally {
        releaseCardLayoutLock();
      }
    },
    [cardItemsByList, listMap, onMoveCard, canTransitionLists, t]
  );

  const resolveSwimOverTarget = useCallback(
    (overId) => {
      const cell = parseSwimCellId(overId);
      if (cell) return cell;
      if (String(overId).startsWith('card-')) {
        const cid = parseCardSortId(overId);
        const listId = findCardContainer(cid, cardItemsByList);
        if (!listId) return null;
        const card = (cardItemsByList[listId] || []).find((c) => String(c._id) === cid);
        if (!card) return null;
        return { listId, laneKey: cardOwnerTeamKey(card) };
      }
      return null;
    },
    [cardItemsByList]
  );

  const handleSwimlaneCardDragOver = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || !active) return;
      const activeId = String(active.id);
      if (!activeId.startsWith('card-')) return;

      const activeCardId = parseCardSortId(activeId);
      const overId = String(over.id);
      const activeListId = findCardContainer(activeCardId, cardItemsByList);
      const target = resolveSwimOverTarget(overId);
      if (!activeListId || !target?.listId) return;

      // Kéo ngang dễ bị closestCenter “hút” xuống hàng Chưa gán team — chỉ đổi lane khi kéo dọc đủ xa.
      const originLaneKey =
        cardDragSnapshotRef.current.cardId === activeCardId
          ? cardDragSnapshotRef.current.originLaneKey
          : '';
      const initialTop = active.rect.current?.initial?.top;
      const translatedTop = active.rect.current?.translated?.top;
      const dy =
        Number.isFinite(initialTop) && Number.isFinite(translatedTop)
          ? translatedTop - initialTop
          : 0;
      const laneIntentional = Math.abs(dy) >= 56;
      const effectiveLaneKey =
        !laneIntentional && originLaneKey ? originLaneKey : target.laneKey;

      const nextOwnerTeamId = ownerTeamIdFromLaneKey(effectiveLaneKey);
      const overListId = target.listId;
      setCardsOverListId(swimCellDropId(overListId, effectiveLaneKey));

      setCardItemsByList((prev) => {
        const activeItems = [...(prev[activeListId] || [])];
        const activeIndex = activeItems.findIndex((c) => String(c._id) === activeCardId);
        if (activeIndex < 0) return prev;
        const moving = activeItems[activeIndex];
        const sameList = activeListId === overListId;
        const sameLane = cardOwnerTeamKey(moving) === effectiveLaneKey;

        let nextState = prev;
        if (sameList && sameLane && overId.startsWith('card-')) {
          const overCardId = parseCardSortId(overId);
          if (activeCardId === overCardId) return prev;
          const laneCards = activeItems.filter((c) => cardOwnerTeamKey(c) === effectiveLaneKey);
          const otherCards = activeItems.filter((c) => cardOwnerTeamKey(c) !== effectiveLaneKey);
          const from = laneCards.findIndex((c) => String(c._id) === activeCardId);
          let to = laneCards.findIndex((c) => String(c._id) === overCardId);
          if (from < 0 || to < 0) return prev;
          const isBelow =
            active.rect.current?.translated &&
            over.rect &&
            active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
          to = to + (isBelow ? 1 : 0);
          if (to > from) to -= 1;
          if (to === from) return prev;
          const reorderedLane = arrayMove(laneCards, from, to);
          nextState = { ...prev, [activeListId]: [...otherCards, ...reorderedLane] };
        } else if (sameList) {
          const patched = activeItems.map((c) =>
            String(c._id) === activeCardId ? { ...c, ownerTeamId: nextOwnerTeamId } : c
          );
          nextState = { ...prev, [activeListId]: patched };
        } else {
          const itemsCopy = [...activeItems];
          const [moved] = itemsCopy.splice(activeIndex, 1);
          const overItems = [...(prev[overListId] || [])];
          overItems.push({
            ...moved,
            listId: overListId,
            ownerTeamId: nextOwnerTeamId,
          });
          nextState = {
            ...prev,
            [activeListId]: itemsCopy,
            [overListId]: overItems,
          };
        }

        const targetIndex = (nextState[overListId] || []).findIndex(
          (c) => String(c._id) === activeCardId
        );
        if (targetIndex >= 0) {
          cardDragSnapshotRef.current = {
            ...cardDragSnapshotRef.current,
            cardId: activeCardId,
            listId: overListId,
            index: targetIndex,
            ownerTeamId: nextOwnerTeamId,
            originLaneKey: originLaneKey || cardDragSnapshotRef.current.originLaneKey,
          };
        }
        return nextState;
      });
    },
    [cardItemsByList, resolveSwimOverTarget]
  );

  const handleDragStart = useCallback(
    (event) => {
      const id = String(event.active.id);
      if (id.startsWith('card-')) {
        handleCardDragStart(event);
        return;
      }
      if (id.startsWith('list-col-')) {
        setDraggingCard(null);
        setDraggingListId(parseListColId(id));
      }
    },
    [handleCardDragStart]
  );

  const handleDragEnd = useCallback(
    (event) => {
      const id = String(event.active.id);
      if (id.startsWith('card-')) {
        handleCardDragEnd(event);
        return;
      }
      if (id.startsWith('list-col-')) {
        handleListDragEnd(event);
      }
    },
    [handleCardDragEnd, handleListDragEnd]
  );

  const handleDragCancel = useCallback(() => {
    setDraggingListId('');
    setDraggingCard(null);
    setCardsOverListId('');
    setCardItemsByList(buildCardItemsByList(listMap));
    skipCardLayoutSyncRef.current = false;
  }, [listMap]);

  const openListMenu = (list, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAnchor(rect);
    setMenuList(list);
  };

  const openCardMenu = (card, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setCardMenuAnchor(rect);
    setCardMenuCard(card);
  };

  const openCardDetail = (card, panel = 'detail') => {
    setDetailCard(card);
    setDetailPanel(panel);
  };

  const listTitleForCard = (card) => {
    const list = listMap.find((l) => String(l._id) === String(card?.listId || ''));
    return list?.title || '';
  };

  const toggleCardComplete = async (card, event) => {
    event.stopPropagation();
    const isDone = String(card?.status || '') === 'done';
    try {
      await onUpdateCard?.(String(card._id), { status: isDone ? 'todo' : 'done' });
    } catch {
      /* toast from parent */
    }
  };

  const renderCardBody = (card, { onOpenMenu, onToggleComplete }) => {
    const labelIds = parseCardLabelIds(card.tags);
    const isDone = String(card?.status || '') === 'done';
    const awaitingApproval = String(card?.status || '') === 'awaiting_approval';
    const listTitle = listTitleForCard(card);
    const overdue = isCardOverdue(card, listTitle);
    const assignees = cardAssignees(card);
    const visibleAssignees = assignees.length > 3 ? assignees.slice(0, 2) : assignees.slice(0, 3);
    const overflowAssigneeCount = assignees.length > 3 ? assignees.length - 2 : 0;
    return (
      <>
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onToggleComplete(card, e)}
            title={isDone ? t('taskBoard.markUndone') : t('taskBoard.markDone')}
            className="mt-0.5 shrink-0 rounded-full"
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Circle className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            )}
          </button>
          <div className="min-w-0 flex-1 pr-5">
            {labelIds.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {labelIds.map((id) => {
                  const l = labelById(id);
                  if (!l) return null;
                  return (
                    <span
                      key={id}
                      className="h-1.5 min-w-[32px] flex-1 rounded-full"
                      style={{ backgroundColor: l.color, maxWidth: 48 }}
                    />
                  );
                })}
              </div>
            ) : null}
            <div className={`font-semibold ${isDone ? 'text-slate-400 line-through' : ''}`}>{card.title}</div>
            {awaitingApproval ? (
              <span
                className={`mt-1 inline-block rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'bg-amber-500/25 text-amber-200' : 'bg-amber-100 text-amber-900'
                }`}
              >
                {t('approvals.pendingBadge')}
              </span>
            ) : null}
          </div>
        </div>
        {card.dueDate ? (
          <div
            className={`mt-1 flex flex-wrap items-center gap-1 text-[10px] ${
              overdue
                ? isDarkMode
                  ? 'text-rose-300'
                  : 'text-rose-700'
                : isDarkMode
                  ? 'text-amber-300/90'
                  : 'text-amber-700'
            }`}
          >
            <span>
              {new Date(card.dueDate).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')}
            </span>
            {overdue ? (
              <span
                className={`rounded px-1 py-px font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'bg-rose-500/25 text-rose-200' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {t('taskBoard.overdueBadge')}
              </span>
            ) : null}
          </div>
        ) : null}
        {visibleAssignees.length > 0 ? (
          <div className="mt-1.5 flex items-center gap-1">
            {visibleAssignees.map((m, idx) => (
              <span
                key={`${m.userId || m.displayName || 'assignee'}-${idx}`}
                title={m.displayName || t('taskBoard.assigneeTitle')}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-semibold text-white"
              >
                {assigneeInitials(m)}
              </span>
            ))}
            {overflowAssigneeCount > 0 ? (
              <span
                className={`text-[10px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
                title={t('taskBoard.moreAssignees', { n: overflowAssigneeCount })}
              >
                +{overflowAssigneeCount}
              </span>
            ) : null}
          </div>
        ) : null}
        {typeof renderCardExtra === 'function' ? renderCardExtra(card) : null}
        <button
          type="button"
          title={t('taskBoard.editCard')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onOpenMenu(card, e)}
          className={`absolute right-1.5 top-1.5 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
            isDarkMode ? 'hover:bg-white/15' : 'hover:bg-slate-200'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <style>{`
        @keyframes taskBoardColumnIn {
          from {
            opacity: 0;
            transform: translateX(-16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>

      {!loadingBoards && boards.length === 0 ? (
        <div
          className={`m-4 rounded-xl border border-dashed p-4 text-sm ${
            isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600'
          }`}
        >
          <p>{t('taskBoard.boardEmptyHint')}</p>
        </div>
      ) : !selectedBoardId ? (
        <div
          className={`m-4 rounded-xl border border-dashed p-4 text-sm ${
            isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600'
          }`}
        >
          {t('taskBoard.boardSelectHint')}
        </div>
      ) : loadingBoardDetail ? (
        <div className={`m-4 rounded-xl p-4 text-sm ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-white text-slate-600'}`}>
          Đang tải nội dung board...
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {activeBoardMeta ? (
            <div
              className={`shrink-0 border-b px-4 py-3 ${
                isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white/80'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {!hideIdentityHeader ? (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`truncate text-base font-semibold ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {activeBoardMeta.title}
                    </h2>
                    {activeBoardMeta.projectCode ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          isDarkMode ? 'bg-indigo-500/20 text-indigo-200' : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {t('taskBoard.projectCodeBadge', { code: activeBoardMeta.projectCode })}
                      </span>
                    ) : null}
                  </div>
                  {activeBoardMeta.description ? (
                    <p
                      className={`mt-1 line-clamp-2 text-xs ${
                        isDarkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {activeBoardMeta.description}
                    </p>
                  ) : null}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    title={t('taskBoard.boardSummaryHint')}
                  >
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        isDarkMode ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {t('taskBoard.boardSummaryTotal', { n: boardSummary.total })}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        isDarkMode ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {t('taskBoard.boardSummaryDone', { pct: boardSummary.donePercent })}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        boardSummary.overdue > 0
                          ? isDarkMode
                            ? 'bg-rose-500/25 text-rose-200'
                            : 'bg-rose-100 text-rose-800'
                          : isDarkMode
                            ? 'bg-white/10 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t('taskBoard.boardSummaryOverdue', { n: boardSummary.overdue })}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        boardSummary.inReview > 0
                          ? isDarkMode
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'bg-amber-50 text-amber-800'
                          : isDarkMode
                            ? 'bg-white/10 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t('taskBoard.boardSummaryReview', { n: boardSummary.inReview })}
                    </span>
                  </div>
                </div>
                ) : (
                  <div className="min-w-0 flex-1" />
                )}
                <div className={`flex flex-wrap items-center gap-2 ${hideIdentityHeader ? 'w-full justify-end' : ''}`}>
                  {boardSearchOpen ? (
                    <div
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                        isDarkMode ? 'border-white/15 bg-black/20' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Search size={14} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                      <input
                        ref={boardSearchInputRef}
                        value={boardSearchQuery}
                        onChange={(e) => setBoardSearchQuery(e.target.value)}
                        placeholder={t('taskBoard.searchCardsPh')}
                        className={`w-[160px] bg-transparent text-xs outline-none sm:w-[200px] ${
                          isDarkMode ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                        }`}
                      />
                      <button
                        type="button"
                        title={t('taskBoard.searchCardsClear')}
                        onClick={() => {
                          setBoardSearchQuery('');
                          setBoardSearchOpen(false);
                        }}
                        className={`rounded p-0.5 ${isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title={t('taskBoard.searchCardsAria')}
                      onClick={() => {
                        setBoardSearchOpen(true);
                        requestAnimationFrame(() => boardSearchInputRef.current?.focus());
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                        isDarkMode
                          ? 'border-white/15 text-slate-300 hover:bg-white/10'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Search size={14} />
                    </button>
                  )}
                  {currentUserId ? (
                    <button
                      type="button"
                      title={t('taskBoard.myTasksOnlyHint')}
                      onClick={() => setShowMyTasksOnly((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        showMyTasksOnly
                          ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                          : isDarkMode
                            ? 'border-white/15 text-slate-300 hover:bg-white/10'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {t('taskBoard.myTasksOnly')}
                    </button>
                  ) : null}
                  {canUseSwimlane ? (
                    <button
                      type="button"
                      title={t('taskBoard.swimlaneToggleHint')}
                      onClick={() => setSwimlaneView((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        swimlaneView
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100'
                          : isDarkMode
                            ? 'border-white/15 text-slate-300 hover:bg-white/10'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {t('taskBoard.swimlaneToggle')}
                    </button>
                  ) : null}
                  {canCreateTeamLists ? (
                    <button
                      type="button"
                      disabled={submittingList}
                      onClick={handleCreateTeamLists}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                        isDarkMode
                          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25'
                          : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      {submittingList ? t('taskBoard.creatingTeamLists') : t('taskBoard.createTeamLists')}
                    </button>
                  ) : null}
                  {canCreateStatusColumns ? (
                    <button
                      type="button"
                      disabled={submittingList}
                      onClick={handleCreateStatusColumns}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                        isDarkMode
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {submittingList
                        ? t('taskBoard.creatingStatusColumns')
                        : t('taskBoard.createStatusColumns')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        <div
          ref={boardScrollRef}
          className={`min-h-0 flex-1 px-3 pb-4 pt-3 ${
            showSwimlaneGrid ? 'overflow-auto' : 'overflow-x-auto overflow-y-hidden'
          }`}
          style={boardSurfaceStyle}
        >
          {showSwimlaneGrid ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleCardDragStart}
              onDragOver={handleSwimlaneCardDragOver}
              onDragEnd={handleCardDragEnd}
              onDragCancel={handleDragCancel}
            >
            <div className="min-h-[min(520px,calc(100vh-220px))] min-w-max">
              <p
                className={`mb-2 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {t('taskBoard.swimlaneToggleHint')}
              </p>
              <div className="flex items-end gap-2 border-b pb-2 mb-2 border-white/10">
                <div
                  className={`${LANE_LABEL_WIDTH} shrink-0 px-1 text-[10px] font-bold uppercase tracking-wide ${
                    isDarkMode ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  {t('taskBoard.swimlaneTeamCol')}
                </div>
                {listMap.map((list) => (
                  <div
                    key={`head-${list._id}`}
                    className={`${LIST_WIDTH} shrink-0 truncate px-2 text-sm font-semibold`}
                  >
                    {list.title}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {swimlaneRows.map((lane) => (
                  <div key={lane.key} className="flex items-stretch gap-2">
                    <div
                      className={`${LANE_LABEL_WIDTH} shrink-0 rounded-lg border px-2 py-2 text-xs font-semibold ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.04] text-slate-200'
                          : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`}
                    >
                      {lane.label}
                    </div>
                    {listMap.map((list) => {
                      const listKey = String(list._id);
                      const cellKey = `${listKey}__${lane.key}`;
                      const cellCards = cardsInSwimlaneCell(listKey, lane.key);
                      const cardSortableIds = cellCards.map((c) => cardSortId(c._id));
                      const composerOpen = Boolean(cardComposerOpen[cellKey]);
                      const cellDropId = swimCellDropId(listKey, lane.key);
                      return (
                        <SwimlaneDropCell
                          key={cellKey}
                          listId={listKey}
                          laneKey={lane.key}
                          listColumnShell={listColumnShell}
                          cardSortableIds={cardSortableIds}
                          isOverHighlight={cardsOverListId === cellDropId}
                          footer={
                          <div className="p-2 pt-0">
                            {composerOpen ? (
                              <div className="space-y-2">
                                <textarea
                                  value={cardDraftByList[cellKey] || ''}
                                  onChange={(e) =>
                                    setCardDraftByList((prev) => ({
                                      ...prev,
                                      [cellKey]: e.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder={t('taskBoard.cardTitlePh')}
                                  className={`w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none ${
                                    isDarkMode
                                      ? 'border-white/15 bg-[#1a1d26] text-white'
                                      : 'border-slate-200 bg-white text-slate-900'
                                  }`}
                                  autoFocus
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  {allowedIssueTypes.length > 1 ? (
                                    <select
                                      className={`rounded-md border px-1.5 py-1 text-[11px] ${
                                        isDarkMode
                                          ? 'border-white/15 bg-[#1a1d26] text-white'
                                          : 'border-slate-200 bg-white text-slate-900'
                                      }`}
                                      value={cardIssueTypeByList[cellKey] || allowedIssueTypes[0]}
                                      onChange={(e) =>
                                        setCardIssueTypeByList((prev) => ({
                                          ...prev,
                                          [cellKey]: e.target.value,
                                        }))
                                      }
                                    >
                                      {allowedIssueTypes.map((it) => (
                                        <option key={it} value={it}>
                                          {it}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={!String(cardDraftByList[cellKey] || '').trim()}
                                    onClick={() => {
                                      const title = String(cardDraftByList[cellKey] || '').trim();
                                      if (!title) return;
                                      onAddCard?.(list._id, {
                                        listId: list._id,
                                        title,
                                        ownerTeamId: lane.teamId || null,
                                        issueType:
                                          cardIssueTypeByList[cellKey] ||
                                          allowedIssueTypes[0] ||
                                          'task',
                                      });
                                      setCardDraftByList((prev) => ({ ...prev, [cellKey]: '' }));
                                      setCardComposerOpen((prev) => ({
                                        ...prev,
                                        [cellKey]: false,
                                      }));
                                    }}
                                    className="rounded-md bg-[#5865F2] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    Thêm thẻ
                                  </button>
                                  <button
                                    type="button"
                                    className={`rounded-md p-1 ${
                                      isDarkMode
                                        ? 'text-slate-400 hover:bg-white/10'
                                        : 'text-slate-500 hover:bg-slate-200'
                                    }`}
                                    onClick={() => {
                                      setCardComposerOpen((prev) => ({
                                        ...prev,
                                        [cellKey]: false,
                                      }));
                                      setCardDraftByList((prev) => ({ ...prev, [cellKey]: '' }));
                                    }}
                                    aria-label={t('common.close')}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ) : canCreateCardsEffective ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setCardComposerOpen((prev) => ({ ...prev, [cellKey]: true }))
                                }
                                className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                                  isDarkMode
                                    ? 'text-slate-300 hover:bg-white/10'
                                    : 'text-slate-600 hover:bg-slate-200/80'
                                }`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Thêm thẻ
                              </button>
                            ) : null}
                          </div>
                          }
                        >
                          {cellCards.map((card) => (
                            <KanbanSortableCard
                              key={card._id}
                              card={card}
                              isDarkMode={isDarkMode}
                              cardShell={cardShell}
                              onOpenDetail={(c) => openCardDetail(c, 'detail')}
                              onOpenMenu={openCardMenu}
                              onToggleComplete={toggleCardComplete}
                              renderCardBody={renderCardBody}
                            />
                          ))}
                        </SwimlaneDropCell>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingCard ? (
                <div
                  className={`${CARD_OVERLAY_WIDTH} cursor-grabbing rounded-lg border px-2 py-2 text-xs shadow-2xl ${cardShell}`}
                >
                  {renderCardBody(draggingCard, {
                    onOpenMenu: () => {},
                    onToggleComplete: (c, e) => e.stopPropagation(),
                  })}
                </div>
              ) : null}
            </DragOverlay>
            </DndContext>
          ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleCardDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex h-full min-h-[min(520px,calc(100vh-220px))] items-start gap-3">
              {listMap.map((list) => {
                const listKey = String(list._id);
                const composerOpen = Boolean(cardComposerOpen[listKey]);
                const listCards = filterCardsForView(cardItemsByList[listKey] || []);
                const cardSortableIds = listCards.map((c) => cardSortId(c._id));
                const isTeamList = /^team\s+/i.test(String(list.title || '').trim());
                return (
                  <KanbanListColumn
                    key={listKey}
                    list={list}
                    isDarkMode={isDarkMode}
                    listColumnShell={listColumnShell}
                    columnEnterClass={COLUMN_ENTER}
                    onMenuClick={(e) => openListMenu(list, e)}
                    cardSortableIds={cardSortableIds}
                    isCardsOver={cardsOverListId === listKey}
                  >
                  {isTeamList && canCreateCards && canUseAiAssign ? (
                    <div className="px-2 pb-1">
                      <button
                        type="button"
                        title={t('taskBoard.aiAssignTeamHint')}
                        onClick={() => openAiAssign(list)}
                        className={`inline-flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                          isDarkMode
                            ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                            : 'border-violet-300 bg-violet-50 text-violet-700'
                        }`}
                      >
                        <Sparkles className="h-3 w-3" />
                        {t('taskBoard.aiAssignTeam')}
                      </button>
                    </div>
                  ) : null}
                  <div className="scrollbar-overlay min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-1">
                    {listCards.map((card) => (
                      <KanbanSortableCard
                        key={card._id}
                        card={card}
                        isDarkMode={isDarkMode}
                        cardShell={cardShell}
                        onOpenDetail={(c) => openCardDetail(c, 'detail')}
                        onOpenMenu={openCardMenu}
                        onToggleComplete={toggleCardComplete}
                        renderCardBody={renderCardBody}
                      />
                    ))}
                  </div>

                  <div className="p-2 pt-0">
                    {composerOpen ? (
                      <div className="space-y-2">
                        <textarea
                          value={cardDraftByList[listKey] || ''}
                          onChange={(e) =>
                            setCardDraftByList((prev) => ({ ...prev, [listKey]: e.target.value }))
                          }
                          rows={2}
                          placeholder={t('taskBoard.cardTitlePh')}
                          className={`w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none ${
                            isDarkMode
                              ? 'border-white/15 bg-[#1a1d26] text-white'
                              : 'border-slate-200 bg-white text-slate-900'
                          }`}
                          autoFocus
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          {allowedIssueTypes.length > 1 ? (
                            <select
                              className={`rounded-md border px-1.5 py-1 text-[11px] ${
                                isDarkMode
                                  ? 'border-white/15 bg-[#1a1d26] text-white'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                              value={cardIssueTypeByList[listKey] || allowedIssueTypes[0]}
                              onChange={(e) =>
                                setCardIssueTypeByList((prev) => ({
                                  ...prev,
                                  [listKey]: e.target.value,
                                }))
                              }
                            >
                              {allowedIssueTypes.map((it) => (
                                <option key={it} value={it}>
                                  {it}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            type="button"
                            disabled={!String(cardDraftByList[listKey] || '').trim()}
                            onClick={() => {
                              const title = String(cardDraftByList[listKey] || '').trim();
                              if (!title) return;
                              onAddCard?.(list._id, {
                                listId: list._id,
                                title,
                                issueType:
                                  cardIssueTypeByList[listKey] || allowedIssueTypes[0] || 'task',
                              });
                              setCardDraftByList((prev) => ({ ...prev, [listKey]: '' }));
                              setCardComposerOpen((prev) => ({ ...prev, [listKey]: false }));
                            }}
                            className="rounded-md bg-[#5865F2] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Thêm thẻ
                          </button>
                          <button
                            type="button"
                            className={`rounded-md p-1 ${
                              isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-200'
                            }`}
                            onClick={() => {
                              setCardComposerOpen((prev) => ({ ...prev, [listKey]: false }));
                              setCardDraftByList((prev) => ({ ...prev, [listKey]: '' }));
                            }}
                            aria-label={t('common.close')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : canCreateCardsEffective ? (
                      <button
                        type="button"
                        onClick={() => setCardComposerOpen((prev) => ({ ...prev, [listKey]: true }))}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                          isDarkMode
                            ? 'text-slate-300 hover:bg-white/10'
                            : 'text-slate-600 hover:bg-slate-200/80'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm thẻ
                      </button>
                    ) : null}
                  </div>
                  </KanbanListColumn>
                );
              })}

            <div
              className={`${LIST_WIDTH} shrink-0 transition-all duration-300 ease-out`}
              style={{ transitionProperty: 'transform, opacity, margin' }}
            >
              {addingListOpen ? (
                <div
                  className={`rounded-xl border p-2 shadow-lg ${listColumnShell} animate-[taskBoardColumnIn_220ms_ease-out]`}
                >
                  <input
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmitNewList();
                      }
                      if (e.key === 'Escape') {
                        setAddingListOpen(false);
                        setNewListTitle('');
                      }
                    }}
                    placeholder={t('taskBoard.listNamePh')}
                    className={`w-full rounded-lg border px-2.5 py-2 text-sm outline-none ${
                      isDarkMode
                        ? 'border-white/15 bg-[#1a1d26] text-white placeholder:text-slate-500'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                    autoFocus
                    disabled={submittingList}
                  />
                  {teamListSuggestions.length > 0 ? (
                    <div className="mt-2">
                      <div
                        className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                          isDarkMode ? 'text-slate-500' : 'text-slate-500'
                        }`}
                      >
                        {t('taskBoard.teamListSuggestions')}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {teamListSuggestions.map((item) => (
                          <button
                            key={item.teamId || item.title}
                            type="button"
                            disabled={submittingList}
                            onClick={() => setNewListTitle(item.title)}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                              isDarkMode
                                ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!newListTitle.trim() || submittingList}
                      onClick={handleSubmitNewList}
                      className="rounded-md bg-[#5865F2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {submittingList ? t('taskBoard.addingList') : t('taskBoard.addList')}
                    </button>
                    <button
                      type="button"
                      disabled={submittingList}
                      onClick={() => {
                        setAddingListOpen(false);
                        setNewListTitle('');
                      }}
                      className={`rounded-md p-1.5 ${
                        isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-200'
                      }`}
                      aria-label={t('taskBoard.cancelAria')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : canManageLists ? (
                <button
                  type="button"
                  onClick={() => setAddingListOpen(true)}
                  className={`flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium transition-all duration-300 ease-out hover:brightness-110 ${
                    isDarkMode
                      ? 'bg-white/15 text-slate-200 hover:bg-white/20'
                      : 'bg-slate-200/90 text-slate-700 hover:bg-slate-300/90'
                  }`}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Thêm danh sách khác
                </button>
              ) : null}
            </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingCard ? (
                <div
                  className={`${CARD_OVERLAY_WIDTH} cursor-grabbing rounded-lg border px-2 py-2 text-xs shadow-2xl ${cardShell}`}
                >
                  {renderCardBody(draggingCard, {
                    onOpenMenu: () => {},
                    onToggleComplete: (c, e) => e.stopPropagation(),
                  })}
                </div>
              ) : draggingListId ? (
                <div
                  className={`${LIST_WIDTH} rounded-xl border p-2 opacity-90 shadow-2xl ${listColumnShell}`}
                >
                  <div className="truncate text-sm font-semibold">
                    {listMap.find((l) => String(l._id) === draggingListId)?.title || ''}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          )}
        </div>
        </div>
      )}

      <TaskBoardListActionsMenu
        isOpen={Boolean(menuList && menuAnchor)}
        anchorRect={menuAnchor}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        list={menuList}
        lists={listMap}
        boards={boardsForMove}
        currentBoardId={selectedBoardId}
        onClose={() => {
          setMenuList(null);
          setMenuAnchor(null);
        }}
        onOpenAddCard={() => {
          if (!menuList) return;
          setCardComposerOpen((prev) => ({ ...prev, [String(menuList._id)]: true }));
        }}
        onRefresh={onRefresh}
      />

      <TaskBoardCardActionsMenu
        isOpen={Boolean(cardMenuCard && cardMenuAnchor)}
        anchorRect={cardMenuAnchor}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        card={cardMenuCard}
        lists={listMap}
        currentBoardId={selectedBoardId}
        onClose={() => {
          setCardMenuCard(null);
          setCardMenuAnchor(null);
        }}
        onOpenCard={(c, panel) => openCardDetail(c, panel)}
        onRefresh={onRefresh}
      />

      <TaskBoardCardDetailModal
        isOpen={Boolean(detailCard)}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        card={detailCard}
        boardId={selectedBoardId}
        listTitle={detailCard ? listTitleForCard(detailCard) : ''}
        lists={listMap}
        initialPanel={detailPanel}
        taskWorkspaceScope={taskWorkspaceScope}
        canCreateTask={
          Array.isArray(boardCapabilities?.permissions)
            ? boardCapabilities.permissions.includes('task:create') ||
              Boolean(boardCapabilities?.canManageBoard)
            : canCreateCards
        }
        canEstimate={
          Array.isArray(boardCapabilities?.permissions)
            ? boardCapabilities.permissions.includes('task:estimate') ||
              Boolean(boardCapabilities?.canManageBoard)
            : true
        }
        onClose={() => {
          setDetailCard(null);
          setDetailPanel('detail');
        }}
        onRefresh={onRefresh}
        onUpdateCard={async (cardId, patch) => {
          await onUpdateCard?.(cardId, patch);
          setDetailCard((prev) => (prev && String(prev._id) === String(cardId) ? { ...prev, ...patch } : prev));
        }}
      />

      <Modal
        isOpen={aiAssignOpen}
        onClose={() => !aiAssignLoading && setAiAssignOpen(false)}
        title={t('taskBoard.aiAssignTeam')}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            {aiAssignList?.title || ''} — {t('taskBoard.aiAssignTeamHint')}
          </p>
          {aiAssignLoading && !aiAssignItems.length ? (
            <p className="text-sm text-slate-300">{t('taskBoard.aiProjectSuggesting')}</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {aiAssignItems.map((item, idx) => (
                <li
                  key={`${item.title}-${idx}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {item.assigneeName || t('taskBoard.unassigned')}
                    {item.dueDate
                      ? ` · ${new Date(item.dueDate).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')}`
                      : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={aiAssignLoading}
              onClick={() => setAiAssignOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              disabled={aiAssignLoading || !aiAssignItems.length}
              onClick={confirmAiAssign}
              className="rounded-lg bg-[#5865F2] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {aiAssignLoading ? t('taskBoard.aiProjectSuggesting') : t('taskBoard.aiAssignConfirm')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
