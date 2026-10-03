import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FlaskConical,
  Link2,
  Plus,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import {
  tcFilterChipClass,
  tcResultBadgeClass,
  tcResultKey,
  tcResultRowClass,
} from './phase3HubUiTokens';
import {
  enrichTestCasesWithBoardCue,
  isReadyForQaList,
  isWorkItemDone,
  partitionCatalogForCard,
  resolveCardList,
  buildQaCardQueueGroups,
} from './qaTestCaseCardScope';
import ProjectHubTcDetailModal from './ProjectHubTcDetailModal';

/** apiClient returns response.data already ({ success, data }). */
function unwrapPayload(res) {
  if (res == null) return null;
  if (Array.isArray(res)) return res;
  if (res.data !== undefined) return res.data;
  return res;
}

function unwrapList(res) {
  const raw = unwrapPayload(res);
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.testCases)) return raw.testCases;
  return [];
}

function unwrapEntity(res) {
  const raw = unwrapPayload(res);
  if (raw?.testCase && typeof raw.testCase === 'object') return raw.testCase;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

function rowId(row) {
  return String(row?._id || row?.id || '');
}

function normalizeResult(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const FILTERS = Object.freeze(['all', 'pass', 'fail', 'none']);

/** Seed titles sometimes baked "— Ready for QA"; strip so we show live column instead. */
function stripBakedColumnSuffix(title) {
  return String(title || '')
    .replace(/\s*[—–-]\s*Ready for QA\s*$/i, '')
    .trim();
}

/**
 * Label for work-item select: card title (+ column when not already filtered to QA).
 */
function formatWorkItemOptionLabel(card, listsById, { includeColumn = true } = {}) {
  const id = String(card?._id || card?.id || '');
  const base = stripBakedColumnSuffix(card?.title) || id;
  if (!includeColumn) return base;
  const list = resolveCardList(card, listsById);
  const column = String(list?.title || '').trim();
  if (column) return `${base} — ${column}`;
  return base;
}

/**
 * QA/UAT — list / create / execute test cases; scope catalog to Ready-for-QA card.
 */
export default function ProjectHubTestCasesPanel({
  projectId = '',
  listActive = true,
  isDarkMode = false,
  canCreate = false,
  canExecute = false,
  boardCards = [],
  boardLists = [],
  onPatchBoardCards = null,
}) {
  const { t } = useAppStrings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState('');
  const [externalKey, setExternalKey] = useState('');
  /** Card đang kiểm thử (Ready for QA) — queue TC gắn card này. */
  const [focusCardId, setFocusCardId] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [attachingId, setAttachingId] = useState('');
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  /** Accordion: card ids đang mở trong hàng đợi (mặc định mở card có TC cần sửa). */
  const [expandedQueueCardIds, setExpandedQueueCardIds] = useState(() => new Set());
  const queueExpandSeededRef = useRef('');
  /** Ignore stale list responses (tab switch / overlapping fetch). */
  const loadSeqRef = useRef(0);
  /** Avoid wiping Pass/Fail by refetching every time user re-enters the tab. */
  const loadedProjectRef = useRef('');

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const sectionShell =
    'rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950';
  const sectionHead = 'border-b border-[#E8E8E8] bg-[#E8F4FC] px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/80';

  const listsById = useMemo(() => {
    const map = new Map();
    for (const list of Array.isArray(boardLists) ? boardLists : []) {
      const id = String(list?._id || list?.id || '');
      if (id) map.set(id, list);
    }
    return map;
  }, [boardLists]);

  const workItemOptions = useMemo(() => {
    const rows = Array.isArray(boardCards) ? boardCards : [];
    return rows
      .map((c) => {
        const id = String(c._id || c.id || '');
        if (!id) return null;
        const list = resolveCardList(c, listsById);
        if (!isReadyForQaList(list)) return null;
        return {
          id,
          label: formatWorkItemOptionLabel(c, listsById, { includeColumn: false }),
          card: c,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [boardCards, listsById]);

  useEffect(() => {
    if (!focusCardId) {
      if (workItemOptions.length === 1) setFocusCardId(workItemOptions[0].id);
      return;
    }
    if (workItemOptions.some((o) => o.id === focusCardId)) return;
    setFocusCardId(workItemOptions[0]?.id || '');
  }, [focusCardId, workItemOptions]);

  const focusCard = useMemo(() => {
    const opt = workItemOptions.find((o) => o.id === focusCardId);
    return opt?.card || null;
  }, [focusCardId, workItemOptions]);

  /** Live board columns override stale API cues (parent back on QA / bug Done). */
  const liveItems = useMemo(
    () => enrichTestCasesWithBoardCue(items, boardCards, listsById),
    [items, boardCards, listsById]
  );

  const partition = useMemo(
    () => partitionCatalogForCard(liveItems, focusCardId, focusCard),
    [liveItems, focusCardId, focusCard]
  );

  const loadList = useCallback(async ({ force = false } = {}) => {
    const pid = String(projectId || '').trim();
    if (!pid) return;
    if (!force && loadedProjectRef.current === pid) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await projectAPI.listTestCases(pid);
      if (seq !== loadSeqRef.current) return;
      setItems(unwrapList(res));
      loadedProjectRef.current = pid;
    } catch {
      if (seq !== loadSeqRef.current) return;
      setItems([]);
      setLoadError(true);
      loadedProjectRef.current = '';
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadedProjectRef.current = '';
    loadSeqRef.current += 1;
    setItems([]);
  }, [projectId]);

  useEffect(() => {
    if (!listActive || !projectId) return undefined;
    void loadList({ force: false });
    return undefined;
  }, [listActive, projectId, loadList]);

  /** Default create form open only when catalog empty (plan: collapsed when TCs exist). */
  useEffect(() => {
    if (loading) return;
    if (!canCreate) {
      setCreateOpen(false);
      return;
    }
    setCreateOpen(items.length === 0);
  }, [loading, canCreate, items.length]);

  const queueSource = useMemo(() => {
    if (focusCardId) return partition.linked;
    // Không dump cả catalog — chỉ TC gắn card Ready for QA.
    const readyIds = new Set(workItemOptions.map((o) => o.id));
    return liveItems.filter((row) => readyIds.has(String(row?.workItemId || '').trim()));
  }, [focusCardId, partition.linked, liveItems, workItemOptions]);

  const counts = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let none = 0;
    let retest = 0;
    for (const row of queueSource) {
      if (row?.needsRetest) retest += 1;
      const r = normalizeResult(row?.lastResult);
      if (r === 'pass') pass += 1;
      else if (r === 'fail') fail += 1;
      else none += 1;
    }
    return { total: queueSource.length, pass, fail, none, retest };
  }, [queueSource]);

  const queueCardGroups = useMemo(
    () =>
      buildQaCardQueueGroups({
        items: liveItems,
        readyCards: workItemOptions,
        focusCardId,
        filter,
        listsById,
      }),
    [liveItems, workItemOptions, focusCardId, filter, listsById]
  );

  // Seed expand: chỉ card có TC cần sửa / retest.
  useEffect(() => {
    const seedKey = `${projectId}:${queueCardGroups.map((g) => g.cardId).join(',')}:${filter}`;
    if (queueExpandSeededRef.current === seedKey) return;
    queueExpandSeededRef.current = seedKey;
    const next = new Set();
    for (const g of queueCardGroups) {
      if (g.attentionCount > 0) next.add(g.cardId);
    }
    if (next.size === 0 && queueCardGroups.length === 1) {
      next.add(queueCardGroups[0].cardId);
    }
    setExpandedQueueCardIds(next);
  }, [projectId, queueCardGroups, filter]);

  const toggleQueueCard = useCallback((cardId) => {
    const id = String(cardId || '');
    if (!id) return;
    setExpandedQueueCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const catalogAttachRows = useMemo(() => {
    if (!focusCardId) return [];
    return [...partition.suggested, ...partition.unlinkedOther];
  }, [focusCardId, partition.suggested, partition.unlinkedOther]);

  const onCreate = async (e) => {
    e?.preventDefault?.();
    const pid = String(projectId || '').trim();
    const nextTitle = String(title || '').trim();
    if (!pid || !nextTitle || creating) return;
    setCreating(true);
    try {
      const res = await projectAPI.createTestCase(pid, {
        title: nextTitle,
        externalKey: String(externalKey || '').trim(),
        workItemId: String(focusCardId || '').trim() || undefined,
      });
      const created = unwrapEntity(res);
      if (created) setItems((prev) => [created, ...prev]);
      else await loadList({ force: true });
      setTitle('');
      setExternalKey('');
      toast.success(t('workspace.phaseQaTestCaseCreated'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaTestCaseCreateFail') })
      );
    } finally {
      setCreating(false);
    }
  };

  const onAttach = async (testCaseId) => {
    const pid = String(projectId || '').trim();
    const id = String(testCaseId || '').trim();
    const wid = String(focusCardId || '').trim();
    if (!pid || !id || !wid || attachingId) return;
    setAttachingId(id);
    try {
      const res = await projectAPI.patchTestCase(pid, id, { workItemId: wid });
      const updated = unwrapEntity(res);
      if (updated) {
        setItems((prev) => prev.map((row) => (rowId(row) === id ? { ...row, ...updated } : row)));
      } else {
        await loadList({ force: true });
      }
      toast.success(t('workspace.phaseQaAttachOk'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaAttachFail') })
      );
    } finally {
      setAttachingId('');
    }
  };

  const onAttachSuggested = async () => {
    const pid = String(projectId || '').trim();
    const wid = String(focusCardId || '').trim();
    const rows = partition.suggested;
    if (!pid || !wid || !rows.length || attachingId) return;
    setAttachingId('bulk');
    let ok = 0;
    try {
      for (const row of rows) {
        const id = rowId(row);
        if (!id) continue;
        const res = await projectAPI.patchTestCase(pid, id, { workItemId: wid });
        const updated = unwrapEntity(res);
        if (updated) {
          ok += 1;
          setItems((prev) => prev.map((r) => (rowId(r) === id ? { ...r, ...updated } : r)));
        }
      }
      toast.success(t('workspace.phaseQaAttachSuggestedOk', { count: ok }));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaAttachFail') })
      );
      await loadList({ force: true });
    } finally {
      setAttachingId('');
    }
  };

  const onExecute = async (testCaseId, result) => {
    const pid = String(projectId || '').trim();
    const id = String(testCaseId || '').trim();
    if (!pid || !id || busyId) return;
    setBusyId(id);
    // Optimistic — số Pass/Fail đổi ngay; nếu API fail thì rollback bằng force reload.
    setItems((prev) =>
      prev.map((row) =>
        rowId(row) === id
          ? { ...row, lastResult: result, lastExecutedAt: new Date().toISOString() }
          : row
      )
    );
    try {
      const res = await projectAPI.executeTestCase(pid, id, { result });
      const payload = unwrapPayload(res);
      const updated = unwrapEntity(res);
      if (updated) {
        setItems((prev) =>
          prev.map((row) =>
            rowId(row) === id
              ? {
                  ...row,
                  ...updated,
                  lastResult: normalizeResult(updated.lastResult) || result,
                }
              : row
          )
        );
      } else {
        await loadList({ force: true });
      }
      const moved = payload?.workItemMoved;
      if (moved && typeof onPatchBoardCards === 'function') {
        const movedId = String(moved._id || moved.id || '');
        if (movedId) {
          onPatchBoardCards((prev) =>
            (prev || []).map((c) =>
              String(c._id || c.id) === movedId ? { ...c, ...moved } : c
            )
          );
        }
      }
      if (result === 'fail' && moved) {
        toast.success(t('workspace.phaseQaFailMovedToTodo'));
      } else if (result === 'fail') {
        toast.success(t('workspace.phaseQaExecuteFailNeedOpenBug'));
      } else {
        toast.success(
          result === 'pass' ? t('workspace.phaseQaExecutePass') : t('workspace.phaseQaExecuteFail')
        );
        if (result === 'pass') setDetailId('');
      }
    } catch (err) {
      await loadList({ force: true });
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaExecuteError') })
      );
    } finally {
      setBusyId('');
    }
  };

  const onOpenBug = async (testCaseId) => {
    const pid = String(projectId || '').trim();
    const id = String(testCaseId || '').trim();
    if (!pid || !id || busyId) return;
    setBusyId(id);
    try {
      const res = await projectAPI.openBugFromTestCase(pid, id);
      const raw = unwrapPayload(res);
      const updated = raw?.testCase || unwrapEntity(res);
      if (updated) {
        setItems((prev) =>
          prev.map((row) =>
            rowId(row) === id
              ? {
                  ...row,
                  ...updated,
                  linkedBugTitle:
                    String(raw?.bug?.title || updated.linkedBugTitle || '').trim() ||
                    row.linkedBugTitle,
                }
              : row
          )
        );
      } else {
        await loadList({ force: true });
      }
      if (typeof onPatchBoardCards === 'function') {
        const bug = raw?.bug;
        const moved = raw?.workItemMoved;
        onPatchBoardCards((prev) => {
          let next = Array.isArray(prev) ? [...prev] : [];
          if (moved) {
            const mid = String(moved._id || moved.id || '');
            next = next.map((c) =>
              String(c._id || c.id) === mid ? { ...c, ...moved } : c
            );
          }
          if (bug) {
            const bid = String(bug._id || bug.id || '');
            if (bid && !next.some((c) => String(c._id || c.id) === bid)) {
              next = [bug, ...next];
            }
          }
          return next;
        });
      }
      toast.success(
        raw?.workItemMoved
          ? t('workspace.phaseQaOpenBugMovedCard')
          : t('workspace.phaseQaOpenBugSuccess')
      );
      setDetailId('');
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaOpenBugFail') })
      );
    } finally {
      setBusyId('');
    }
  };

  const resultBadge = (value) => {
    const raw = tcResultKey(value);
    if (raw === 'pass') {
      return {
        label: t('workspace.phaseQaResultPass'),
        className: tcResultBadgeClass('pass'),
        Icon: CheckCircle2,
      };
    }
    if (raw === 'fail') {
      return {
        label: t('workspace.phaseQaResultFail'),
        className: tcResultBadgeClass('fail'),
        Icon: XCircle,
      };
    }
    return {
      label: t('workspace.phaseQaResultNone'),
      className: tcResultBadgeClass('none'),
      Icon: CircleDashed,
    };
  };

  const resolveWorkTitle = (workItemId) => {
    const wid = String(workItemId || '');
    if (!wid) return '—';
    const card = (Array.isArray(boardCards) ? boardCards : []).find(
      (c) => String(c._id || c.id) === wid
    );
    if (!card) return wid.slice(-6);
    return formatWorkItemOptionLabel(card, listsById).slice(0, 64);
  };

  const detailRow = detailId
    ? liveItems.find((r) => rowId(r) === detailId) || null
    : null;

  if (loadError && items.length === 0 && !loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12">
        <FlaskConical className={`h-8 w-8 ${muted}`} aria-hidden />
        <p className={`text-center text-sm ${muted}`}>{t('workspace.phaseQaLoadFail')}</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => void loadList({ force: true })}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t('workspace.phaseQaRetry')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-busy={loading || undefined}
    >
      <div className="scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
        {/* Header + stats */}
        <section className={sectionShell}>
          <div className={sectionHead}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={`flex items-center gap-2 text-sm font-bold ${titleCls}`}>
                  <FlaskConical className="h-4 w-4 shrink-0 text-[#1677FF]" aria-hidden />
                  {t('workspace.phaseQaTestCasesTitle')}
                </h3>
                <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
                  {t('workspace.phaseQaTestCasesHint')}
                </p>
              </div>
              <dl className="flex flex-wrap gap-2 text-[11px]">
                {[
                  {
                    key: 'total',
                    label: t('workspace.phaseQaStatTotal'),
                    value: counts.total,
                    tone: 'border-border bg-background',
                  },
                  {
                    key: 'pass',
                    label: t('workspace.phaseQaStatPass'),
                    value: counts.pass,
                    tone: tcResultRowClass('pass'),
                  },
                  {
                    key: 'fail',
                    label: t('workspace.phaseQaStatFail'),
                    value: counts.fail,
                    tone: tcResultRowClass('fail'),
                  },
                  {
                    key: 'retest',
                    label: t('workspace.phaseQaStatRetest'),
                    value: counts.retest,
                    tone:
                      counts.retest > 0
                        ? 'border-amber-400/50 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40'
                        : 'border-border bg-background',
                  },
                  {
                    key: 'none',
                    label: t('workspace.phaseQaStatNone'),
                    value: counts.none,
                    tone: tcResultRowClass('none'),
                  },
                ].map((stat) => (
                  <div
                    key={stat.key}
                    className={`min-w-[4.25rem] rounded-lg border px-2.5 py-1.5 ${stat.tone}`}
                  >
                    <dt className={muted}>{stat.label}</dt>
                    <dd className={`text-sm font-bold tabular-nums ${titleCls}`}>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Focus card */}
        <section className={sectionShell}>
          <div className={sectionHead}>
            <h4 className={`text-xs font-semibold ${titleCls}`}>
              {t('workspace.phaseQaSectionFocus')}
            </h4>
          </div>
          <div className="px-3.5 py-3">
            <label className="flex min-w-0 max-w-xl flex-col text-xs font-semibold text-muted-foreground">
              {t('workspace.phaseQaFocusCard')}
              <select
                value={focusCardId}
                onChange={(e) => setFocusCardId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary"
              >
                <option value="">{t('workspace.phaseQaFocusCardAll')}</option>
                {workItemOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label.slice(0, 80)}
                  </option>
                ))}
              </select>
              {workItemOptions.length === 0 ? (
                <span className={`mt-1 text-[11px] font-normal ${muted}`}>
                  {t('workspace.phaseQaNoReadyCards')}
                </span>
              ) : null}
            </label>
          </div>
        </section>

        {/* Filters */}
        <section className={sectionShell}>
          <div className={sectionHead}>
            <h4 className={`text-xs font-semibold ${titleCls}`}>
              {t('workspace.phaseQaSectionStats')}
            </h4>
          </div>
          <div
            className="flex flex-wrap gap-1.5 px-3.5 py-3"
            role="tablist"
            aria-label={t('workspace.phaseQaFilterAria')}
          >
            {FILTERS.map((id) => {
              const active = filter === id;
              const count =
                id === 'all'
                  ? counts.total
                  : id === 'pass'
                    ? counts.pass
                    : id === 'fail'
                      ? counts.fail
                      : counts.none;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${tcFilterChipClass(
                    id,
                    { active }
                  )}`}
                >
                  {t(`workspace.phaseQaFilter_${id}`)}
                  <span className="ml-1 tabular-nums opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Catalog attach */}
        {focusCardId && canCreate && catalogAttachRows.length > 0 ? (
          <section className={sectionShell}>
            <div className={`${sectionHead} flex flex-wrap items-center justify-between gap-2`}>
              <h4 className={`text-xs font-semibold ${titleCls}`}>
                {t('workspace.phaseQaSectionCatalog')}
              </h4>
              {partition.suggested.length > 0 ? (
                <button
                  type="button"
                  disabled={Boolean(attachingId)}
                  onClick={() => void onAttachSuggested()}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                >
                  <Link2 className="h-3 w-3" aria-hidden />
                  {t('workspace.phaseQaAttachSuggested', { count: partition.suggested.length })}
                </button>
              ) : null}
            </div>
            <div className="px-3.5 py-3">
              <p className={`mb-2 text-[11px] ${muted}`}>{t('workspace.phaseQaCatalogAttachHint')}</p>
              <ul className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/50">
                {catalogAttachRows.map((row) => {
                  const id = rowId(row);
                  const suggested = partition.suggested.some((s) => rowId(s) === id);
                  return (
                    <li
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${titleCls}`}>{row.title || '—'}</p>
                        <p className={`font-mono text-[10px] ${muted}`}>
                          {row.externalKey || row.code || '—'}
                          {suggested ? ` · ${t('workspace.phaseQaSuggestedBadge')}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(attachingId)}
                        onClick={() => void onAttach(id)}
                        className="shrink-0 rounded-full bg-[#1677FF] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        {attachingId === id
                          ? t('common.loading')
                          : t('workspace.phaseQaAttach')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        {/* Create TC */}
        {canCreate ? (
          <section className={sectionShell}>
            <button
              type="button"
              className={`${sectionHead} flex w-full items-center justify-between gap-2 text-left`}
              onClick={() => setCreateOpen((v) => !v)}
              aria-expanded={createOpen}
            >
              <h4 className={`flex items-center gap-1.5 text-xs font-semibold ${titleCls}`}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('workspace.phaseQaSectionCreate')}
              </h4>
              {createOpen ? (
                <ChevronDown className={`h-4 w-4 ${muted}`} aria-hidden />
              ) : (
                <ChevronRight className={`h-4 w-4 ${muted}`} aria-hidden />
              )}
            </button>
            {createOpen ? (
              <form
                className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-end"
                onSubmit={(e) => void onCreate(e)}
              >
                <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
                  {t('workspace.phaseQaFieldTitle')}
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    placeholder={t('workspace.phaseQaTitlePh')}
                    required
                    disabled={creating}
                  />
                </label>
                <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground sm:max-w-[12rem]">
                  {t('workspace.phaseQaFieldExternalKey')}
                  <input
                    type="text"
                    value={externalKey}
                    onChange={(e) => setExternalKey(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    placeholder={t('workspace.phaseQaExternalKeyPh')}
                    disabled={creating}
                  />
                </label>
                <p className={`self-center text-[11px] sm:max-w-[12rem] ${muted}`}>
                  {focusCardId
                    ? t('workspace.phaseQaCreateLinksFocus')
                    : t('workspace.phaseQaCreateUnlinkedHint')}
                </p>
                <button
                  type="submit"
                  disabled={creating || !String(title || '').trim()}
                  className="rounded-full bg-[#1677FF] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {creating ? t('common.loading') : t('workspace.phaseQaCreate')}
                </button>
              </form>
            ) : (
              <p className={`px-3.5 py-2 text-[11px] ${muted}`}>
                {t('workspace.phaseQaSectionCreateToggle')}
              </p>
            )}
          </section>
        ) : null}

        {/* TC queue — theo card, tách Cần sửa / Chờ duyệt; chi tiết trong popup */}
        <section className={sectionShell}>
          <div className={sectionHead}>
            <h4 className={`text-xs font-semibold ${titleCls}`}>
              {t('workspace.phaseQaSectionQueue')}
              <span className={`ml-1.5 font-normal ${muted}`}>
                ({queueCardGroups.length} {t('workspace.phaseQaQueueCardUnit')} · {counts.total} TC)
              </span>
            </h4>
            <p className={`mt-0.5 text-[11px] font-normal ${muted}`}>
              {t('workspace.phaseQaQueueByCardHint')}
            </p>
          </div>
          <div className="px-3.5 py-3">
            {loading && items.length === 0 ? (
              <p className={`py-6 text-center text-sm ${muted}`}>{t('common.loading')}</p>
            ) : workItemOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <FlaskConical className={`h-7 w-7 ${muted}`} aria-hidden />
                <p className={`text-sm ${muted}`}>{t('workspace.phaseQaNoReadyCards')}</p>
              </div>
            ) : queueCardGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <FlaskConical className={`h-7 w-7 ${muted}`} aria-hidden />
                <p className={`text-sm ${muted}`}>
                  {focusCardId
                    ? t('workspace.phaseQaQueueEmpty')
                    : t('workspace.phaseQaFilterEmpty')}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {queueCardGroups.map((group) => {
                  const expanded = expandedQueueCardIds.has(group.cardId);
                  return (
                    <li
                      key={group.cardId}
                      className="overflow-hidden rounded-xl border border-border/60 bg-background"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                        aria-expanded={expanded}
                        onClick={() => toggleQueueCard(group.cardId)}
                      >
                        {expanded ? (
                          <ChevronDown className={`h-4 w-4 shrink-0 ${muted}`} aria-hidden />
                        ) : (
                          <ChevronRight className={`h-4 w-4 shrink-0 ${muted}`} aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-semibold ${titleCls}`}>
                            {group.title}
                          </p>
                          {group.columnTitle ? (
                            <p className={`truncate text-[10px] ${muted}`}>{group.columnTitle}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          {group.attentionCount > 0 ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-100">
                              {t('workspace.phaseQaQueueNeedsFixCount', {
                                count: group.attentionCount,
                              })}
                            </span>
                          ) : null}
                          {group.awaitingCount > 0 ? (
                            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {t('workspace.phaseQaQueueAwaitingCount', {
                                count: group.awaitingCount,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </button>

                      {expanded ? (
                        <div className="space-y-3 border-t border-border/50 bg-muted/10 px-3 py-2.5">
                          {group.attention.length > 0 ? (
                            <div>
                              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                {t('workspace.phaseQaQueueSectionNeedsFix')}
                              </p>
                              <ul className="space-y-1">
                                {group.attention.map((row) => {
                                  const id = rowId(row);
                                  const lastResult = normalizeResult(row.lastResult);
                                  const badge = resultBadge(lastResult);
                                  const BadgeIcon = badge.Icon;
                                  return (
                                    <li key={id}>
                                      <button
                                        type="button"
                                        onClick={() => setDetailId(id)}
                                        className="flex w-full items-center gap-2 rounded-lg border border-amber-400/35 bg-amber-50/70 px-2.5 py-2 text-left transition hover:border-amber-500/50 dark:border-amber-500/30 dark:bg-amber-950/25"
                                      >
                                        <span className={`font-mono text-[10px] ${muted}`}>
                                          {row.code || '—'}
                                        </span>
                                        <span
                                          className={`min-w-0 flex-1 truncate text-xs font-medium ${titleCls}`}
                                        >
                                          {row.title || '—'}
                                        </span>
                                        <span
                                          className={`inline-flex shrink-0 items-center gap-0.5 ${badge.className}`}
                                        >
                                          <BadgeIcon className="h-3 w-3" aria-hidden />
                                          {badge.label}
                                        </span>
                                        {row.needsRetest ? (
                                          <span className="hidden shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900 sm:inline dark:text-amber-100">
                                            {t('workspace.phaseQaNeedsRetestBadge')}
                                          </span>
                                        ) : row.linkedBugOpen ? (
                                          <span className="hidden shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary sm:inline">
                                            {t('workspace.phaseQaBugOpenBadge')}
                                          </span>
                                        ) : null}
                                        <ChevronRight
                                          className="h-3.5 w-3.5 shrink-0 text-[#1677FF]"
                                          aria-hidden
                                        />
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}

                          {group.awaiting.length > 0 ? (
                            <div>
                              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {t('workspace.phaseQaQueueSectionAwaiting')}
                              </p>
                              <ul className="space-y-1">
                                {group.awaiting.map((row) => {
                                  const id = rowId(row);
                                  const lastResult = normalizeResult(row.lastResult);
                                  const badge = resultBadge(lastResult);
                                  const BadgeIcon = badge.Icon;
                                  return (
                                    <li key={id}>
                                      <button
                                        type="button"
                                        onClick={() => setDetailId(id)}
                                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:border-[#91CAFF] ${tcResultRowClass(
                                          lastResult
                                        )}`}
                                      >
                                        <span className={`font-mono text-[10px] ${muted}`}>
                                          {row.code || '—'}
                                        </span>
                                        <span
                                          className={`min-w-0 flex-1 truncate text-xs font-medium ${titleCls}`}
                                        >
                                          {row.title || '—'}
                                        </span>
                                        <span
                                          className={`inline-flex shrink-0 items-center gap-0.5 ${badge.className}`}
                                        >
                                          <BadgeIcon className="h-3 w-3" aria-hidden />
                                          {badge.label}
                                        </span>
                                        <ChevronRight
                                          className="h-3.5 w-3.5 shrink-0 text-[#1677FF]"
                                          aria-hidden
                                        />
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ProjectHubTcDetailModal
        open={Boolean(detailRow)}
        testCase={detailRow}
        workItemLabel={detailRow ? resolveWorkTitle(detailRow.workItemId) : ''}
        workItemDone={
          detailRow
            ? isWorkItemDone(detailRow.workItemId, boardCards, listsById)
            : false
        }
        busy={Boolean(detailId) && busyId === detailId}
        canExecute={canExecute}
        onClose={() => setDetailId('')}
        onPass={() => void onExecute(detailId, 'pass')}
        onFail={() => void onExecute(detailId, 'fail')}
        onOpenBug={() => void onOpenBug(detailId)}
      />
    </div>
  );
}
