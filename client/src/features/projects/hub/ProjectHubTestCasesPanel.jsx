import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleDashed, FlaskConical, RotateCcw, XCircle } from 'lucide-react';
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

/**
 * QA/UAT — list / create / execute test cases; open bug on fail.
 */
export default function ProjectHubTestCasesPanel({
  projectId = '',
  listActive = true,
  isDarkMode = false,
  canCreate = false,
  canExecute = false,
  boardCards = [],
}) {
  const { t } = useAppStrings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState('');
  const [externalKey, setExternalKey] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState('all');
  /** Ignore stale list responses (tab switch / overlapping fetch). */
  const loadSeqRef = useRef(0);
  /** Avoid wiping Pass/Fail by refetching every time user re-enters the tab. */
  const loadedProjectRef = useRef('');

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const surface = isDarkMode ? 'bg-white/5' : 'bg-muted/40';

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

  const counts = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let none = 0;
    for (const row of items) {
      const r = normalizeResult(row?.lastResult);
      if (r === 'pass') pass += 1;
      else if (r === 'fail') fail += 1;
      else none += 1;
    }
    return { total: items.length, pass, fail, none };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((row) => {
      const r = normalizeResult(row?.lastResult);
      if (filter === 'none') return !r || (r !== 'pass' && r !== 'fail');
      return r === filter;
    });
  }, [items, filter]);

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
        workItemId: String(workItemId || '').trim() || undefined,
      });
      const created = unwrapEntity(res);
      if (created) setItems((prev) => [created, ...prev]);
      else await loadList({ force: true });
      setTitle('');
      setExternalKey('');
      setWorkItemId('');
      toast.success(t('workspace.phaseQaTestCaseCreated'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaTestCaseCreateFail') })
      );
    } finally {
      setCreating(false);
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
      toast.success(
        result === 'pass' ? t('workspace.phaseQaExecutePass') : t('workspace.phaseQaExecuteFail')
      );
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
          prev.map((row) => (rowId(row) === id ? { ...row, ...updated } : row))
        );
      } else {
        await loadList({ force: true });
      }
      toast.success(t('workspace.phaseQaOpenBugSuccess'));
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
      <header className={`shrink-0 border-b border-border px-4 py-3 ${surface}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`flex items-center gap-2 text-sm font-bold ${titleCls}`}>
              <FlaskConical className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {t('workspace.phaseQaTestCasesTitle')}
            </h3>
            <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
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
                key: 'none',
                label: t('workspace.phaseQaStatNone'),
                value: counts.none,
                tone: tcResultRowClass('none'),
              },
            ].map((stat) => (
              <div
                key={stat.key}
                className={`min-w-[4.5rem] rounded-lg border px-2.5 py-1.5 ${stat.tone}`}
              >
                <dt className={muted}>{stat.label}</dt>
                <dd className={`text-sm font-bold tabular-nums ${titleCls}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          className="mt-3 flex flex-wrap gap-1.5"
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
      </header>

      {canCreate ? (
        <form
          className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-end"
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
          <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground sm:max-w-[14rem]">
            {t('workspace.phaseQaFieldWorkItem')}
            <select
              value={workItemId}
              onChange={(e) => setWorkItemId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              disabled={creating}
            >
              <option value="">{t('workspace.phaseQaWorkItemNone')}</option>
              {(Array.isArray(boardCards) ? boardCards : []).map((c) => {
                const id = String(c._id || c.id || '');
                if (!id) return null;
                return (
                  <option key={id} value={id}>
                    {String(c.title || id).slice(0, 60)}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || !String(title || '').trim()}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creating ? t('common.loading') : t('workspace.phaseQaCreate')}
          </button>
        </form>
      ) : null}

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-auto px-4 py-3">
        {loading && items.length === 0 ? (
          <p className={`py-8 text-center text-sm ${muted}`}>{t('common.loading')}</p>
        ) : visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <FlaskConical className={`h-7 w-7 ${muted}`} aria-hidden />
            <p className={`text-sm ${muted}`}>
              {items.length === 0
                ? t('workspace.phaseQaEmpty')
                : t('workspace.phaseQaFilterEmpty')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-sm">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-muted/40">
                <tr className="border-b border-border/50">
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.phaseQaFieldTitle')}
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.phaseQaFieldExternalKey')}
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.phaseQaFilterAria')}
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.phaseQaFieldWorkItem')}
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.listActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => {
                  const id = rowId(row);
                  const lastResult = normalizeResult(row.lastResult);
                  const rowBusy = busyId === id;
                  const badge = resultBadge(lastResult);
                  const BadgeIcon = badge.Icon;
                  const hasBug = Boolean(row.linkedBugId);
                  const workTitle = (() => {
                    const wid = String(row.workItemId || '');
                    if (!wid) return '—';
                    const card = (Array.isArray(boardCards) ? boardCards : []).find(
                      (c) => String(c._id || c.id) === wid
                    );
                    return card?.title ? String(card.title).slice(0, 40) : wid.slice(-6);
                  })();
                  return (
                    <tr
                      key={id}
                      className={`${tcResultRowClass(lastResult)} border-b border-border/35 odd:bg-muted/10 hover:bg-muted/35`}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className={`truncate font-semibold ${titleCls}`}>
                            {row.title || '—'}
                          </span>
                          {hasBug ? (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {t('workspace.phaseQaBugLinked')}
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-0.5 font-mono text-[10px] ${muted}`}>
                          {row.code || '—'}
                        </p>
                      </td>
                      <td className={`px-3 py-2.5 align-middle font-mono ${muted}`}>
                        {row.externalKey || '—'}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`inline-flex items-center gap-1 ${badge.className}`}>
                          <BadgeIcon className="h-3 w-3" aria-hidden />
                          {badge.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 align-middle ${muted}`}>
                        {workTitle}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canExecute ? (
                            <>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void onExecute(id, 'pass')}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
                              >
                                {t('workspace.phaseQaPass')}
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void onExecute(id, 'fail')}
                                className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                              >
                                {t('workspace.phaseQaFail')}
                              </button>
                            </>
                          ) : null}
                          {lastResult === 'fail' && !hasBug ? (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => void onOpenBug(id)}
                              className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {t('workspace.phaseQaOpenBug')}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
