import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Director dashboard — Delayed / On Track / Completed (+ budget stub).
 */
export default function DirectorProjectHealthPanel({ orgId }) {
  const { t } = useAppStrings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.getDirectorHealth(orgId, { includeArchived });
      setData(unwrap(res));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.directorHealthLoadFail') })
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, includeArchived, t]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.counts || { delayed: 0, onTrack: 0, completed: 0, total: 0 };

  return (
    <AdminUserPanelShell
      title={t('adminTasks.directorHealthTitle')}
      hint={t('adminTasks.directorHealthHint')}
      wide
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          {t('adminTasks.directorIncludeArchived')}
        </label>
        <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
          {loading ? '…' : t('common.refresh') || 'Refresh'}
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { key: 'total', label: t('adminTasks.directorTotal'), value: counts.total },
          { key: 'delayed', label: t('adminTasks.directorDelayed'), value: counts.delayed },
          { key: 'onTrack', label: t('adminTasks.directorOnTrack'), value: counts.onTrack },
          { key: 'completed', label: t('adminTasks.directorCompleted'), value: counts.completed },
        ].map((c) => (
          <div key={c.key} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <AdminUserFormCard title={t('adminTasks.directorProjects')}>
        {!data?.projects?.length ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.directorEmpty')}</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto text-sm">
            {data.projects.map((p) => (
              <li
                key={p.projectId || p.title}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="font-semibold">{p.title || p.projectId}</span>
                <span className="text-xs text-muted-foreground">
                  {p.status} · {p.health}
                  {p.dueDate ? ` · due ${new Date(p.dueDate).toLocaleDateString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminUserFormCard>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AdminUserFormCard title={t('adminTasks.directorCapacityHint')}>
          <p className="text-sm text-muted-foreground">
            {data?.capacityHint?.note || t('adminTasks.directorCapacityBody')}
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {data?.capacityHint?.endpoint || '/api/projects/resources/capacity'}
          </p>
        </AdminUserFormCard>
        <AdminUserFormCard title={t('adminTasks.directorBurndownHint')}>
          <p className="text-sm text-muted-foreground">
            {data?.burndownHint?.note || t('adminTasks.directorBurndownBody')}
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {data?.burndownHint?.endpoint || '/api/projects/:projectId/sprints/:sprintId/time-summary'}
          </p>
        </AdminUserFormCard>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {data?.budget?.note || t('adminTasks.directorBudgetStub')}
      </p>
    </AdminUserPanelShell>
  );
}
