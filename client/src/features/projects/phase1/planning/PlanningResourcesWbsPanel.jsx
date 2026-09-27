import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { getStructured, isWbsLeaf } from './staffingPipelineModel';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Step 1 — WBS / Task: leaf work to staff (title + notes).
 */
export default function PlanningResourcesWbsPanel({ projectId }) {
  const { t } = useAppStrings();
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['planningArtifacts', projectId, 'WBS'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'WBS' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const leaves = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((a) => isWbsLeaf(a, list));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leaves;
    return leaves.filter((a) => {
      const st = getStructured(a);
      const hay = [a.title, a.externalKey, st.notes, a.summary]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [leaves, filter]);

  const selected = useMemo(
    () => filtered.find((a) => String(a._id || a.id) === String(selectedId || '')) || null,
    [filtered, selectedId]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-gradient-to-r from-sky-50 via-background to-background p-3 shadow-sm dark:from-sky-950/30 dark:via-surface dark:to-surface">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
              {t('workspace.phase1StaffingLeafCount', { count: leaves.length })}
            </span>
          </div>
          <Link
            to={buildPhase1ModulePath(projectId, 'planning/wbs')}
            className="text-xs font-medium text-sky-600 transition hover:text-sky-500 hover:underline"
          >
            {t('workspace.phase1StaffingOpenSiblingWbs')}
          </Link>
        </div>
      </div>

      <div className="space-y-2">
          <div className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
            <input
              className="w-full rounded-xl border border-border bg-background px-2.5 py-2 text-sm outline-none ring-0 transition focus:border-sky-400"
              placeholder={t('common.search')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : null}
          {isError ? (
            <button type="button" className="text-sm text-destructive" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          ) : null}
          {!isLoading && !filtered.length ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
              {t('workspace.phase1StaffingWbsEmpty')}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => {
                const st = getStructured(a);
                return (
                  <li key={String(a._id || a.id)}>
                    <button
                      type="button"
                      className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/30"
                      onClick={() => setSelectedId(String(a._id || a.id))}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {a.externalKey || '—'}
                        </span>
                        {st.effortHours != null ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {st.effortHours}h
                          </span>
                        ) : null}
                      </div>
                      <span className="line-clamp-2 text-sm font-medium text-foreground">
                        {a.title || '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.externalKey || t('workspace.phaseNavPlanningResourcesWbs')}
        size="lg"
      >
        {selected ? (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">{selected.title || '—'}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mt-1 text-sm font-medium text-foreground">{selected.status || 'draft'}</p>
              </div>
              <div className="rounded-xl border border-border px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Effort</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {getStructured(selected).effortHours ?? '—'}h
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('workspace.phase1StaffingNotes')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {String(getStructured(selected).notes || selected.summary || '—').trim() || '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Role / skill</p>
              <p className="mt-1 text-sm text-foreground">
                {String(getStructured(selected).roleKey || '—')}
                {getStructured(selected).skillKeys?.length
                  ? ` · ${getStructured(selected).skillKeys.join(', ')}`
                  : ''}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
