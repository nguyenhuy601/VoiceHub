import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function availabilityBadgeClass(availability, isDarkMode) {
  if (availability === 'available') {
    return isDarkMode
      ? 'bg-emerald-500/20 text-emerald-300'
      : 'bg-emerald-500/15 text-emerald-700';
  }
  if (availability === 'partial') {
    return isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-500/15 text-amber-800';
  }
  return isDarkMode ? 'bg-red-500/20 text-red-300' : 'bg-red-500/15 text-red-700';
}

function availabilityLabel(availability, t) {
  if (availability === 'available') return t('adminTasks.plannerAvailAvailable');
  if (availability === 'partial') return t('adminTasks.plannerAvailPartial');
  if (availability === 'overallocated') return t('adminTasks.plannerAvailOver');
  return String(availability || '—');
}

/**
 * Resource Planner — filter related depts / dept / project; add member (T5).
 * Dùng được ở Admin (orgId) hoặc Hub (projectId + canManage).
 */
export default function ResourcePlannerPanel({
  orgId = '',
  projectId: projectIdProp = '',
  canManage = true,
  embedded = false,
  isDarkMode = false,
}) {
  const { t } = useAppStrings();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(String(projectIdProp || ''));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [addRoleKey, setAddRoleKey] = useState('');
  const [busyUserId, setBusyUserId] = useState('');

  const muted = isDarkMode ? 'text-slate-300' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const inputCls = isDarkMode
    ? 'mt-1 block min-w-[10rem] rounded-lg border border-slate-600 bg-[#1A1A1C] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary [color-scheme:dark]'
    : 'mt-1 block min-w-[10rem] rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary';

  useEffect(() => {
    if (projectIdProp) setProjectId(String(projectIdProp));
  }, [projectIdProp]);

  useEffect(() => {
    if (!orgId || projectIdProp) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.list({ organizationId: orgId });
        const list = unwrap(res);
        if (!cancelled) setProjects(Array.isArray(list) ? list : list?.items || []);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, projectIdProp]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.listRoleCatalog(orgId);
        const list = unwrap(res);
        if (!cancelled) {
          const roles = Array.isArray(list) ? list : list?.roles || [];
          setRoleCatalog(roles);
          if (!addRoleKey && roles[0]?.key) setAddRoleKey(String(roles[0].key));
        }
      } catch {
        if (!cancelled) setRoleCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId && !projectId) return;
    setLoading(true);
    try {
      const res = projectId
        ? await projectAPI.getProjectPlanner(projectId, { asOf, organizationId: orgId })
        : await projectAPI.getResourcePlanner(orgId, { asOf });
      const data = unwrap(res);
      setMeta(data);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.plannerLoadFail') }));
      setItems([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, asOf, t]);

  useEffect(() => {
    load();
  }, [load]);

  const relatedHint = useMemo(() => {
    const ids = meta?.relatedDepartmentIds || [];
    if (meta?.hint === 'related_departments_empty') {
      return t('adminTasks.plannerNoRelatedDepts');
    }
    if (projectId && ids.length) {
      return t('adminTasks.plannerRelatedCount', { n: ids.length });
    }
    return null;
  }, [meta, projectId, t]);

  const addMember = async (userId) => {
    if (!canManage || !projectId || !userId || !addRoleKey) {
      toast.error(t('adminTasks.plannerNeedRole'));
      return;
    }
    setBusyUserId(userId);
    try {
      const start = asOf || new Date().toISOString().slice(0, 10);
      await projectAPI.setMemberRoles(projectId, userId, [addRoleKey], {
        allocations: [{ startDate: start, endDate: null, allocationPct: 50 }],
      });
      toast.success(t('adminTasks.plannerMemberAdded'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.plannerAddFail') }));
    } finally {
      setBusyUserId('');
    }
  };

  const body = (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {!projectIdProp ? (
          <label className="block text-xs">
            <span className={muted}>{t('adminTasks.plannerProject')}</span>
            <select
              className={`${inputCls} min-w-[14rem]`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{t('adminTasks.plannerAllOrg')}</option>
              {projects.map((p) => {
                const id = String(p.projectId || p._id || '');
                return (
                  <option key={id} value={id}>
                    {p.projectCode ? `${p.projectCode} — ` : ''}
                    {p.title || id}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
        <label className="block text-xs">
          <span className={muted}>{t('adminTasks.plannerAsOf')}</span>
          <input
            type="date"
            className={inputCls}
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        {canManage && projectId ? (
          <label className="block text-xs">
            <span className={muted}>{t('adminTasks.plannerAddRole')}</span>
            <select
              className={inputCls}
              value={addRoleKey}
              onChange={(e) => setAddRoleKey(e.target.value)}
            >
              {roleCatalog.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label || r.key}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className={adminSecondaryBtnClass('', isDarkMode)}
          onClick={load}
          disabled={loading}
        >
          {loading ? t('common.loading') : t('common.refresh')}
        </button>
      </div>

      {relatedHint ? <p className={`mb-3 text-xs ${muted}`}>{relatedHint}</p> : null}

      <AdminUserFormCard title={t('adminTasks.plannerPeople')} isDarkMode={isDarkMode}>
        {loading && !items.length ? (
          <p className={`text-sm ${muted}`}>{t('common.loading')}</p>
        ) : !items.length ? (
          <p className={`text-sm ${muted}`}>{t('adminTasks.plannerEmpty')}</p>
        ) : (
          <ul className="max-h-[32rem] space-y-2 overflow-auto">
            {items.map((row) => (
              <li
                key={row.userId}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                  isDarkMode ? 'border-slate-600 bg-[#1A1A1C]' : 'border-border'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`truncate text-sm font-semibold ${titleCls}`}>
                      {row.displayName}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${availabilityBadgeClass(
                        row.availability,
                        isDarkMode
                      )}`}
                    >
                      {availabilityLabel(row.availability, t)}
                    </span>
                    {row.alreadyMember ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          isDarkMode
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {t('adminTasks.plannerAlreadyMember')}
                      </span>
                    ) : null}
                  </div>
                  <p className={`mt-0.5 text-[11px] ${muted}`}>
                    {t('adminTasks.plannerAllocLine', {
                      dept: row.departmentName || '—',
                      alloc: row.allocatedPct ?? 0,
                      free: row.availablePct ?? 0,
                    })}
                  </p>
                </div>
                {canManage && projectId && !row.alreadyMember ? (
                  <button
                    type="button"
                    className={adminPrimaryBtnClass()}
                    disabled={Boolean(busyUserId) || !addRoleKey}
                    onClick={() => addMember(row.userId)}
                  >
                    {busyUserId === row.userId
                      ? t('common.saving')
                      : t('adminTasks.plannerAdd')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminUserFormCard>
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{body}</div>;
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.planner')}
      hint={t('adminTasks.plannerHint')}
      wide
    >
      {body}
    </AdminUserPanelShell>
  );
}
