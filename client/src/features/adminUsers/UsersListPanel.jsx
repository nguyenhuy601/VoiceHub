import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Upload } from 'lucide-react';
import { ConfirmDialog } from '../../components/Shared';
import AdminUserActionsMenu from '../../components/adminUsers/AdminUserActionsMenu';
import AdminUserDetailDrawer from '../../components/adminUsers/AdminUserDetailDrawer';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import { organizationAPI } from '../../services/api/organizationAPI';
import roleAPI from '../../services/api/roleAPI';
import { useAppStrings } from '../../locales/appStrings';
import { getInitials } from '../../utils/helpers';
import useAdminMembers from '../../hooks/useAdminMembers';
import { normalizeRoleDisplayName, unwrapList } from '../../utils/adminRbacUtils';
import {
  formatRbacRoleLabels,
  memberDepartmentId,
  memberDisplayName,
  memberEmail,
  memberOrgRole,
  memberStatusKey,
  memberStatusLabel,
  memberTeamId,
  memberUserId,
} from '../../utils/adminUserUtils';
import {
  buildOrgRoleBadgeByUserId,
  buildResponsibilityByUserIdFromKeyLists,
  formatResponsibilityBadges,
  memberJobTitle,
  orgRoleBadgeLabel,
  unwrapOrgList,
} from '../../utils/userTaxonomyUtils';

function StatusBadge({ member, t }) {
  const key = memberStatusKey(member);
  const styles = {
    active: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300',
    locked: 'bg-amber-500/12 text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-200',
    inactive: 'bg-slate-500/12 text-slate-700 ring-1 ring-slate-500/20 dark:text-slate-300',
    mustChangePassword: 'bg-sky-500/12 text-sky-800 ring-1 ring-sky-500/25 dark:text-sky-200',
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[key] || styles.active}`}
    >
      {memberStatusLabel(member, t)}
    </span>
  );
}

function AccountRoleBadge({ role }) {
  const r = String(role || 'member').toLowerCase();
  const color =
    r === 'owner' || r === 'admin'
      ? 'bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-300'
      : r === 'hr'
        ? 'bg-cyan-500/12 text-cyan-800 ring-1 ring-cyan-500/20 dark:text-cyan-200'
        : 'bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15 dark:text-slate-300';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${color}`}>
      {r}
    </span>
  );
}

function UserRoleCell({ labels, emptyLabel }) {
  if (!labels.length) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <div className="flex max-w-[200px] flex-wrap gap-1">
      {labels.map((name) => (
        <span
          key={name}
          className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-500/15 dark:text-red-300"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function OrgRoleBadgeCell({ badges, t }) {
  if (!badges?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((key) => (
        <span
          key={key}
          className="inline-flex rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-500/15 dark:text-indigo-300"
        >
          {orgRoleBadgeLabel(key, t)}
        </span>
      ))}
    </div>
  );
}

function ResponsibilityCell({ keys, emptyLabel }) {
  const { visible, overflow } = formatResponsibilityBadges(keys);
  if (!visible.length) return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  return (
    <div className="flex max-w-[160px] flex-wrap gap-1">
      {visible.map((key) => (
        <span
          key={key}
          className="inline-flex rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-800 ring-1 ring-teal-500/15 dark:text-teal-200"
        >
          {key}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="text-[10px] text-muted-foreground">+{overflow}</span>
      ) : null}
    </div>
  );
}

function collectDeptTeamMaps(structure) {
  const departments = new Map();
  const teams = new Map();
  for (const branch of structure?.branches || []) {
    for (const division of branch?.divisions || []) {
      for (const department of division?.departments || []) {
        const did = String(department._id || department.id || '');
        if (did) departments.set(did, department.name || did);
        for (const team of department?.teams || []) {
          const tid = String(team._id || team.id || '');
          if (tid) teams.set(tid, team.name || tid);
        }
      }
    }
  }
  for (const department of structure?.departments || []) {
    const did = String(department._id || department.id || '');
    if (did) departments.set(did, department.name || did);
    for (const team of department?.teams || []) {
      const tid = String(team._id || team.id || '');
      if (tid) teams.set(tid, team.name || tid);
    }
  }
  return { departments, teams };
}

export default function UsersListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const navigate = useNavigate();
  const { organization } = useCompanyAdminContext();
  const { members, loading } = useAdminMembers(orgId);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [structureMaps, setStructureMaps] = useState({ departments: new Map(), teams: new Map() });
  const [structureRaw, setStructureRaw] = useState(null);
  const [orgRoleByUser, setOrgRoleByUser] = useState({});
  const [responsibilityByUser, setResponsibilityByUser] = useState({});
  const [rbacByUser, setRbacByUser] = useState({});
  const [detailMember, setDetailMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getStructure(orgId);
        const body = res?.data?.data ?? res?.data ?? res;
        if (!cancelled) {
          setStructureRaw(body);
          setStructureMaps(collectDeptTeamMaps(body));
          const badgeMap = buildOrgRoleBadgeByUserId(body);
          setOrgRoleByUser(Object.fromEntries(badgeMap));
        }
      } catch {
        if (!cancelled) setStructureMaps({ departments: new Map(), teams: new Map() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const catalogRes = await organizationAPI.listResponsibilities(orgId);
        const catalog = unwrapOrgList(catalogRes);
        const keys = catalog.map((r) => r.key).filter(Boolean);
        const entries = await Promise.all(
          keys.map(async (key) => {
            try {
              const res = await organizationAPI.listResponsibilityUsersByKey(orgId, key);
              const body = res?.data?.data ?? res?.data ?? res;
              const userIds = Array.isArray(body?.userIds)
                ? body.userIds
                : Array.isArray(body)
                  ? body.map((row) => String(row?.userId || row || '').trim()).filter(Boolean)
                  : [];
              return { key, userIds };
            } catch {
              return { key, userIds: [] };
            }
          })
        );
        if (!cancelled) {
          const map = buildResponsibilityByUserIdFromKeyLists(entries);
          setResponsibilityByUser(Object.fromEntries(map));
        }
      } catch {
        if (!cancelled) setResponsibilityByUser({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !members.length) {
      setRbacByUser({});
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        members.map(async (m) => {
          const uid = memberUserId(m);
          if (!uid) return ['', []];
          try {
            const res = await roleAPI.getUserRoles(uid, orgId);
            return [uid, unwrapList(res)];
          } catch {
            return [uid, []];
          }
        })
      );
      if (!cancelled) {
        setRbacByUser(Object.fromEntries(entries.filter(([uid]) => uid)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, members]);

  const formatWhen = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const scopeOptions = useMemo(() => {
    const opts = [];
    for (const [id, name] of structureMaps.departments) {
      opts.push({ id: `dep:${id}`, label: name, type: 'department' });
    }
    for (const [id, name] of structureMaps.teams) {
      opts.push({ id: `team:${id}`, label: name, type: 'team' });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [structureMaps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter && memberOrgRole(m) !== roleFilter) return false;
      if (statusFilter && memberStatusKey(m) !== statusFilter) return false;
      if (scopeFilter) {
        const [kind, id] = scopeFilter.split(':');
        if (kind === 'dep' && memberDepartmentId(m) !== id) return false;
        if (kind === 'team' && memberTeamId(m) !== id) return false;
      }
      if (!q) return true;
      const id = memberUserId(m);
      const dep = structureMaps.departments.get(memberDepartmentId(m)) || '';
      const team = structureMaps.teams.get(memberTeamId(m)) || '';
      const rbacLabels = formatRbacRoleLabels(rbacByUser[id] || [], (row) =>
        normalizeRoleDisplayName(row?.name || row?.role?.name)
      );
      const jobTitle = memberJobTitle(m).toLowerCase();
      const respKeys = (responsibilityByUser[id] || []).join(' ').toLowerCase();
      return (
        memberDisplayName(m).toLowerCase().includes(q) ||
        memberEmail(m).toLowerCase().includes(q) ||
        memberOrgRole(m).includes(q) ||
        jobTitle.includes(q) ||
        respKeys.includes(q) ||
        rbacLabels.some((label) => label.toLowerCase().includes(q)) ||
        dep.toLowerCase().includes(q) ||
        team.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [members, query, roleFilter, statusFilter, scopeFilter, structureMaps, rbacByUser, responsibilityByUser]);

  const confirmDelete = () => {
    const id = memberUserId(deleteMember);
    if (!id) return;
    setDeleteMember(null);
    navigate(`/app/admin/users/delete?userId=${encodeURIComponent(id)}`);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {t('adminDomains.users.list')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {organization?.name ? `${organization.name} · ` : ''}
            {t('adminUsers.listCount', { n: filtered.length, total: members.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/admin/users/import"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/40"
          >
            <Upload className="h-4 w-4" />
            {t('adminDomains.users.import')}
          </Link>
          <Link
            to="/app/admin/users/create"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500"
          >
            <UserPlus className="h-4 w-4" />
            {t('adminDomains.users.create')}
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('adminUsers.searchPlaceholder')}
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none ring-red-500/30 focus:ring-2"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            >
              <option value="">{t('adminUsers.filterAllRoles')}</option>
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="hr">hr</option>
              <option value="member">member</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            >
              <option value="">{t('adminUsers.filterAllStatus')}</option>
              <option value="active">{t('adminUsers.statusActive')}</option>
              <option value="locked">{t('adminUsers.statusLocked')}</option>
              <option value="inactive">{t('adminUsers.statusInactive')}</option>
              <option value="mustChangePassword">{t('adminUsers.statusMustChangePassword')}</option>
            </select>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="min-w-[160px] rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            >
              <option value="">{t('adminUsers.filterAllScopes')}</option>
              {scopeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.type === 'team' ? `Team · ${opt.label}` : opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{t('adminUsers.colUser')}</th>
                  <th className="px-4 py-3">{t('companyAdmin.colEmail')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colAccountRole')}</th>
                  <th className="px-4 py-3" title={t('adminUsers.colUserRoleHint')}>
                    {t('adminUsers.colUserRole')}
                  </th>
                  <th className="px-4 py-3">{t('adminUsers.colPosition')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colResponsibility')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colDepartment')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colLastLogin')}</th>
                  <th className="w-12 px-2 py-3 text-center">
                    <span className="sr-only">{t('adminUsers.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const id = memberUserId(m);
                  const name = memberDisplayName(m);
                  const depId = memberDepartmentId(m);
                  const teamId = memberTeamId(m);
                  const depName = structureMaps.departments.get(depId);
                  const teamName = structureMaps.teams.get(teamId);
                  const rbacLabels = formatRbacRoleLabels(rbacByUser[id] || [], (row) =>
                    normalizeRoleDisplayName(row?.name || row?.role?.name)
                  );
                  return (
                    <tr
                      key={id}
                      className="border-b border-border/50 transition hover:bg-muted/20"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="flex max-w-[240px] items-center gap-3 text-left"
                          onClick={() => setDetailMember(m)}
                        >
                          {m.avatar ? (
                            <img src={m.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-[11px] font-bold text-white">
                              {getInitials(name)}
                            </div>
                          )}
                          <span className="truncate font-medium text-foreground hover:underline">
                            {name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{memberEmail(m)}</td>
                      <td className="px-4 py-3">
                        <AccountRoleBadge role={memberOrgRole(m)} />
                      </td>
                      <td className="px-4 py-3">
                        <UserRoleCell labels={rbacLabels} emptyLabel={t('adminUsers.userRoleNone')} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-[140px] truncate">{memberJobTitle(m) || '—'}</div>
                        <OrgRoleBadgeCell badges={orgRoleByUser[id]} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <ResponsibilityCell
                          keys={responsibilityByUser[id]}
                          emptyLabel={t('adminUsers.responsibilityNone')}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-[160px] truncate">
                          {depName || teamName || '—'}
                          {depName && teamName ? (
                            <span className="block truncate text-[11px] opacity-70">{teamName}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge member={m} t={t} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatWhen(m.lastLoginAt)}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <AdminUserActionsMenu
                          member={m}
                          onViewDetail={setDetailMember}
                          onRequestDelete={setDeleteMember}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminUsers.noUsers')}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <AdminUserDetailDrawer
        orgId={orgId}
        member={detailMember}
        open={Boolean(detailMember)}
        onClose={() => setDetailMember(null)}
        departmentName={
          detailMember
            ? structureMaps.departments.get(memberDepartmentId(detailMember)) || ''
            : ''
        }
        teamName={
          detailMember ? structureMaps.teams.get(memberTeamId(detailMember)) || '' : ''
        }
        rbacRoles={
          detailMember ? rbacByUser[memberUserId(detailMember)] || [] : []
        }
        formatWhen={formatWhen}
        structureRaw={structureRaw}
        responsibilityKeys={
          detailMember ? responsibilityByUser[memberUserId(detailMember)] || [] : []
        }
      />

      <ConfirmDialog
        isOpen={Boolean(deleteMember)}
        onClose={() => setDeleteMember(null)}
        onConfirm={confirmDelete}
        title={t('adminDomains.users.delete')}
        message={t('adminUsers.removeConfirm')}
        confirmText={t('adminDomains.users.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}
