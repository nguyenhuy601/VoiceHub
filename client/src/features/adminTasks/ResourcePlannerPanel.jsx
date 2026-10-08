import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const PLANNER_INPUT_CLASS = adminInputClass('mt-1 !w-auto min-w-[10rem] !py-1.5');

function availabilityBadgeClass(availability) {
  if (availability === 'available') return 'bg-success-bg text-success';
  if (availability === 'partial') return 'bg-warning-bg text-warning';
  return 'border border-destructive text-destructive';
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
  const [loadError, setLoadError] = useState('');
  const [projectsError, setProjectsError] = useState(false);
  const [rolesError, setRolesError] = useState(false);

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
        if (!cancelled) {
          setProjects(Array.isArray(list) ? list : list?.items || []);
          setProjectsError(false);
        }
      } catch {
        if (!cancelled) {
          setProjects([]);
          setProjectsError(true);
        }
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
          setRolesError(false);
          if (!addRoleKey && roles[0]?.key) setAddRoleKey(String(roles[0].key));
        }
      } catch {
        if (!cancelled) {
          setRoleCatalog([]);
          setRolesError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId && !projectId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = projectId
        ? await projectAPI.getProjectPlanner(projectId, { asOf, organizationId: orgId })
        : await projectAPI.getResourcePlanner(orgId, { asOf });
      const data = unwrap(res);
      setMeta(data);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.plannerLoadFail') }));
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
            <span className="text-muted-foreground">{t('adminTasks.plannerProject')}</span>
            <select
              className={`${PLANNER_INPUT_CLASS} min-w-[14rem]`}
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
          <span className="text-muted-foreground">{t('adminTasks.plannerAsOf')}</span>
          <input
            type="date"
            className={PLANNER_INPUT_CLASS}
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        {canManage && projectId ? (
          <label className="block text-xs">
            <span className="text-muted-foreground">{t('adminTasks.plannerAddRole')}</span>
            <select
              className={PLANNER_INPUT_CLASS}
              disabled={!roleCatalog.length}
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
          aria-busy={loading}
        >
          <AdminBusySpinner busy={loading} />
          {t('common.refresh')}
        </button>
      </div>

      {relatedHint ? <p className="mb-3 text-xs text-muted-foreground">{relatedHint}</p> : null}
      {projectsError && !projectIdProp ? (
        <p className="mb-3 text-xs text-warning">{t('adminTasks.plannerProjectsLoadFail')}</p>
      ) : null}
      {canManage && projectId && rolesError ? (
        <p className="mb-3 text-xs text-warning">{t('adminTasks.plannerRolesLoadFail')}</p>
      ) : null}
      {canManage && projectId && !rolesError && !roleCatalog.length ? (
        <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.plannerRoleCatalogEmpty')}</p>
      ) : null}

      <AdminUserFormCard title={t('adminTasks.plannerPeople')} isDarkMode={isDarkMode}>
        {loading && !items.length && !loadError ? (
          <AdminListSkeleton rows={5} />
        ) : loadError ? (
          <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
        ) : !items.length ? (
          <AdminEmptyState message={t('adminTasks.plannerEmpty')} />
        ) : (
          <ul className="max-h-[32rem] space-y-2 overflow-auto">
            {items.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {row.displayName}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${availabilityBadgeClass(
                        row.availability
                      )}`}
                    >
                      {availabilityLabel(row.availability, t)}
                    </span>
                    {row.alreadyMember ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t('adminTasks.plannerAlreadyMember')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
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
                    aria-busy={busyUserId === row.userId}
                    onClick={() => addMember(row.userId)}
                  >
                    <AdminBusySpinner busy={busyUserId === row.userId} />
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
