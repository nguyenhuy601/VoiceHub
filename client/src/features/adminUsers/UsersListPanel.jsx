import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../../components/Shared';
import AdminUserActionsMenu from '../../components/adminUsers/AdminUserActionsMenu';
import AdminUserDetailDrawer from '../../components/adminUsers/AdminUserDetailDrawer';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import { organizationAPI } from '../../services/api/organizationAPI';
import roleAPI from '../../services/api/roleAPI';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { getInitials } from '../../utils/helpers';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useDebouncedValue } from '../search/useDebouncedValue';
import { normalizeRoleDisplayName, unwrapList } from '../../utils/adminRbacUtils';
import {
  compareMembersForAdminList,
  formatRbacRoleLabels,
  memberDepartmentId,
  memberDisplayName,
  memberEmail,
  memberEmployeeCode,
  memberOrgRole,
  memberStatusKey,
  memberStatusLabel,
  memberTeamId,
  memberUserId,
  unwrapApi,
} from '../../utils/adminUserUtils';
import { buildOrgRoleRowsByUserId, memberJobTitle } from '../../utils/userTaxonomyUtils';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

/** Số dòng mỗi trang trên danh sách admin users. */
const USERS_LIST_PAGE_SIZE = 10;
const CAP_BADGE = {
  pending_hr: 'bg-amber-500/12 text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-200',
  verified: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300',
  rejected: 'bg-red-500/12 text-red-700 ring-1 ring-red-500/20 dark:text-red-300',
  draft: 'bg-slate-500/10 text-slate-600 ring-1 ring-slate-500/15 dark:text-slate-300',
};

function CapabilityStatusBadge({ status, t }) {
  const key = ['pending_hr', 'verified', 'rejected'].includes(status) ? status : 'draft';
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CAP_BADGE[key]}`}
    >
      {t(`settingsCapability.status.${key}`)}
    </span>
  );
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      results[i] = await mapper(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
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

function hasUserCache(map, userId) {
  return Boolean(userId) && Object.prototype.hasOwnProperty.call(map, userId);
}

function accountRoleLabel(role, t) {
  const r = String(role || 'member').toLowerCase();
  if (r === 'owner') return t('organizations.roleOwner');
  if (r === 'admin') return t('adminUsers.roleAdmin');
  if (r === 'hr') return t('adminUsers.roleHr');
  return t('adminUsers.roleMember');
}

function CellPlaceholder() {
  return <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" aria-hidden />;
}

function UsersTableSkeletonRows({ rows = USERS_LIST_PAGE_SIZE }) {
  return Array.from({ length: rows }, (_, rowIdx) => (
    <tr key={`sk-${rowIdx}`} className="border-b border-border/50">
      {Array.from({ length: 12 }, (_, colIdx) => (
        <td key={colIdx} className="px-4 py-3">
          <span className="inline-block h-4 w-full max-w-[7rem] animate-pulse rounded bg-muted" />
        </td>
      ))}
    </tr>
  ));
}

function AccountRoleBadge({ role, t }) {
  const r = String(role || 'member').toLowerCase();
  const color =
    r === 'owner' || r === 'admin'
      ? 'bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-300'
      : r === 'hr'
        ? 'bg-cyan-500/12 text-cyan-800 ring-1 ring-cyan-500/20 dark:text-cyan-200'
        : 'bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/15 dark:text-slate-300';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color}`}>
      {accountRoleLabel(role, t)}
    </span>
  );
}

function isSystemAdminMember(member) {
  return String(member?.systemRole || '').trim().toLowerCase() === 'admin';
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

function OrgRoleCell({ rows, emptyLabel }) {
  if (!rows?.length) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <div className="flex max-w-[180px] flex-col gap-1">
      {rows.map((row) => (
        <div key={row.id} className="min-w-0">
          <span className="inline-flex rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-500/15 dark:text-indigo-300">
            {row.label}
          </span>
          {row.scopeName ? (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={row.scopeName}>
              {row.scopeName}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SortableTh({ label, columnKey, activeKey, dir, onSort }) {
  const active = activeKey === columnKey;
  return (
    <th
      className="px-4 py-3"
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
        onClick={() => onSort(columnKey)}
      >
        {label}
        <span className={active ? 'text-foreground' : 'opacity-40'} aria-hidden>
          {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </button>
    </th>
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
  const { members, loading, error: membersError, loadMembers } = useAdminMembers(orgId);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const rbacByUserRef = useRef({});
  const capabilityByUserRef = useRef({});
  const pageItemsRef = useRef([]);
  const membersRef = useRef([]);
  const [structureMaps, setStructureMaps] = useState({ departments: new Map(), teams: new Map() });
  const [structureRaw, setStructureRaw] = useState(null);
  const [orgRoleByUser, setOrgRoleByUser] = useState({});
  const [rbacByUser, setRbacByUser] = useState({});
  const [capabilityByUser, setCapabilityByUser] = useState({});
  const [detailMember, setDetailMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);

  rbacByUserRef.current = rbacByUser;
  capabilityByUserRef.current = capabilityByUser;

  const activeFilterCount = [roleFilter, statusFilter, capabilityFilter, scopeFilter].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
  }, [orgId, debouncedQuery, roleFilter, statusFilter, capabilityFilter, scopeFilter, sortKey, sortDir]);

  useEffect(() => {
    setRbacByUser({});
    setCapabilityByUser({});
    rbacByUserRef.current = {};
    capabilityByUserRef.current = {};
  }, [orgId]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onDoc = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) {
        setFiltersOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [structureRes, assignRes] = await Promise.all([
          organizationAPI.getStructure(orgId),
          orgRoleCatalogAPI.listAssignments(orgId).catch(() => null),
        ]);
        const body = structureRes?.data?.data ?? structureRes?.data ?? structureRes;
        const assignments =
          assignRes?.data?.assignments ||
          assignRes?.data?.data?.assignments ||
          [];
        if (!cancelled) {
          setStructureRaw(body);
          setStructureMaps(collectDeptTeamMaps(body));
          const rowMap = buildOrgRoleRowsByUserId(body, assignments, t);
          setOrgRoleByUser(Object.fromEntries(rowMap));
        }
      } catch {
        if (!cancelled) {
          setStructureMaps({ departments: new Map(), teams: new Map() });
          setOrgRoleByUser({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

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

  const capabilityHydrationPending = Boolean(capabilityFilter) && members.some((m) => {
    const id = memberUserId(m);
    return id && !hasUserCache(capabilityByUser, id);
  });

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter && memberOrgRole(m) !== roleFilter) return false;
      if (statusFilter && memberStatusKey(m) !== statusFilter) return false;
      if (capabilityFilter && !capabilityHydrationPending) {
        const id = memberUserId(m);
        if (!hasUserCache(capabilityByUser, id)) return false;
        const cap = capabilityByUser[id] || 'draft';
        if (capabilityFilter === 'draft') {
          if (cap !== 'draft' && cap !== '') return false;
        } else if (cap !== capabilityFilter) {
          return false;
        }
      }
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
      const code = memberEmployeeCode(m).toLowerCase();
      const roleLabel = accountRoleLabel(memberOrgRole(m), t).toLowerCase();
      return (
        memberDisplayName(m).toLowerCase().includes(q) ||
        memberEmail(m).toLowerCase().includes(q) ||
        memberOrgRole(m).includes(q) ||
        roleLabel.includes(q) ||
        jobTitle.includes(q) ||
        rbacLabels.some((label) => label.toLowerCase().includes(q)) ||
        dep.toLowerCase().includes(q) ||
        team.toLowerCase().includes(q) ||
        code.includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [
    members,
    debouncedQuery,
    roleFilter,
    statusFilter,
    capabilityFilter,
    capabilityHydrationPending,
    scopeFilter,
    structureMaps,
    rbacByUser,
    capabilityByUser,
    t,
  ]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => compareMembersForAdminList(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / USERS_LIST_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * USERS_LIST_PAGE_SIZE;
    return sorted.slice(start, start + USERS_LIST_PAGE_SIZE);
  }, [sorted, safePage]);

  const pageUserIdsKey = useMemo(
    () => pageItems.map((m) => memberUserId(m)).filter(Boolean).join('|'),
    [pageItems]
  );
  const memberIdsKey = useMemo(
    () => members.map((m) => memberUserId(m)).filter(Boolean).join('|'),
    [members]
  );
  pageItemsRef.current = pageItems;
  membersRef.current = members;

  useEffect(() => {
    if (!orgId || !pageUserIdsKey) {
      return undefined;
    }
    const rows = pageItemsRef.current;
    let cancelled = false;
    (async () => {
      const missing = rows.filter((m) => {
        const uid = memberUserId(m);
        return uid && !hasUserCache(rbacByUserRef.current, uid);
      });
      if (!missing.length) return;
      const entries = await Promise.all(
        missing.map(async (m) => {
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
        setRbacByUser((prev) => {
          const next = { ...prev };
          for (const [uid, roles] of entries) {
            if (uid) next[uid] = roles;
          }
          rbacByUserRef.current = next;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, pageUserIdsKey]);

  useEffect(() => {
    if (!orgId || !memberIdsKey) {
      return undefined;
    }
    const allMembers = membersRef.current;
    const rows = pageItemsRef.current;
    const source = capabilityFilter ? allMembers : rows;
    if (!source.length) return undefined;
    let cancelled = false;
    (async () => {
      const missing = source.filter((m) => {
        const uid = memberUserId(m);
        return uid && !hasUserCache(capabilityByUserRef.current, uid);
      });
      if (!missing.length) return;
      const poolRows = await mapPool(missing, 5, async (m) => {
        const uid = memberUserId(m);
        if (!uid) return ['', 'draft'];
        try {
          const res = await adminUserAPI.getProfile(orgId, uid);
          const data = unwrapApi(res)?.data ?? unwrapApi(res);
          const status = String(data?.capability?.verificationStatus || 'draft').trim() || 'draft';
          return [uid, status];
        } catch {
          return [uid, 'draft'];
        }
      });
      if (!cancelled) {
        setCapabilityByUser((prev) => {
          const next = { ...prev };
          for (const [uid, status] of poolRows) {
            if (uid) next[uid] = status;
          }
          capabilityByUserRef.current = next;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, memberIdsKey, pageUserIdsKey, capabilityFilter]);

  const handleSortColumn = (columnKey) => {
    if (sortKey === columnKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(columnKey);
    setSortDir('asc');
  };

  const clearListFilters = () => {
    setRoleFilter('');
    setStatusFilter('');
    setCapabilityFilter('');
    setScopeFilter('');
  };

  const showMembersError = Boolean(membersError) && !members.length && !loading;
  const showMembersSkeleton = loading && !members.length;
  const showCapabilityWait = Boolean(capabilityFilter) && capabilityHydrationPending && !showMembersSkeleton && !showMembersError;
  const showTableBody = !showMembersError && !showMembersSkeleton && !showCapabilityWait;

  const confirmDelete = () => {
    const id = memberUserId(deleteMember);
    if (!id) return;
    if (isSystemAdminMember(deleteMember)) {
      toast.error(t('adminUsers.removeSystemAdminBlocked'));
      setDeleteMember(null);
      return;
    }
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
            {t('adminUsers.listCount', { n: sorted.length, total: members.length })}
            {' · '}
            {t('adminUsers.listPageSizeHint', { size: USERS_LIST_PAGE_SIZE })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/admin/users/import"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500"
          >
            <UserPlus className="h-4 w-4" />
            {t('adminDomains.users.import')}
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={filtersRef}>
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-controls="users-list-filters"
                onClick={() => setFiltersOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                {t('adminUsers.filters')}
                {activeFilterCount ? (
                  <span
                    className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    title={t('adminUsers.filtersActive', { n: activeFilterCount })}
                  >
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              {filtersOpen ? (
                <div
                  id="users-list-filters"
                  className="absolute right-0 z-20 mt-2 w-[min(calc(100vw-2rem),20rem)] space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg"
                >
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">{t('adminUsers.filterAllRoles')}</option>
                    <option value="owner">{t('organizations.roleOwner')}</option>
                    <option value="admin">{t('adminUsers.roleAdmin')}</option>
                    <option value="hr">{t('adminUsers.roleHr')}</option>
                    <option value="member">{t('adminUsers.roleMember')}</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">{t('adminUsers.filterAllStatus')}</option>
                    <option value="active">{t('adminUsers.statusActive')}</option>
                    <option value="locked">{t('adminUsers.statusLocked')}</option>
                    <option value="inactive">{t('adminUsers.statusInactive')}</option>
                    <option value="mustChangePassword">{t('adminUsers.statusMustChangePassword')}</option>
                  </select>
                  <select
                    value={capabilityFilter}
                    onChange={(e) => setCapabilityFilter(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    aria-label={t('adminUsers.filterCapability')}
                  >
                    <option value="">{t('adminUsers.filterAllCapability')}</option>
                    <option value="pending_hr">{t('adminUsers.filterCapPending')}</option>
                    <option value="verified">{t('adminUsers.filterCapVerified')}</option>
                    <option value="rejected">{t('adminUsers.filterCapRejected')}</option>
                    <option value="draft">{t('adminUsers.filterCapDraft')}</option>
                  </select>
                  <select
                    value={scopeFilter}
                    onChange={(e) => setScopeFilter(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  >
                    <option value="">{t('adminUsers.filterAllScopes')}</option>
                    {scopeOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.type === 'team' ? `${t('adminUsers.colTeam')} · ${opt.label}` : opt.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={`${sortKey}:${sortDir}`}
                    onChange={(e) => {
                      const [k, d] = String(e.target.value || 'name:asc').split(':');
                      setSortKey(k === 'employeeCode' || k === 'email' ? k : 'name');
                      setSortDir(d === 'desc' ? 'desc' : 'asc');
                    }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    aria-label={t('adminUsers.sortBy')}
                  >
                    <option value="name:asc">{t('adminUsers.sortNameAz')}</option>
                    <option value="name:desc">{t('adminUsers.sortNameZa')}</option>
                    <option value="employeeCode:asc">{t('adminUsers.sortCodeAz')}</option>
                    <option value="employeeCode:desc">{t('adminUsers.sortCodeZa')}</option>
                  </select>
                  {activeFilterCount ? (
                    <button
                      type="button"
                      onClick={clearListFilters}
                      className="w-full rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                    >
                      {t('adminUsers.filtersClear')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {showMembersError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('companyAdmin.loadMembersFail')}</p>
            <button
              type="button"
              onClick={() => loadMembers()}
              className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              {t('adminUsers.listRetry')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <SortableTh
                    label={t('adminUsers.colUser')}
                    columnKey="name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSortColumn}
                  />
                  <SortableTh
                    label={t('adminUsers.colEmployeeCode')}
                    columnKey="employeeCode"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSortColumn}
                  />
                  <SortableTh
                    label={t('companyAdmin.colEmail')}
                    columnKey="email"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSortColumn}
                  />
                  <th className="px-4 py-3">{t('adminUsers.colAccountRole')}</th>
                  <th className="px-4 py-3" title={t('adminUsers.colUserRoleHint')}>
                    {t('adminUsers.colUserRole')}
                  </th>
                  <th className="px-4 py-3">{t('adminUsers.colPosition')}</th>
                  <th className="px-4 py-3" title={t('adminUsers.colOrgRoleHint')}>
                    {t('adminUsers.colOrgRole')}
                  </th>
                  <th className="px-4 py-3">{t('adminUsers.colDepartment')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colCapability')}</th>
                  <th className="px-4 py-3">{t('adminUsers.colLastLogin')}</th>
                  <th className="w-12 px-2 py-3 text-center">
                    <span className="sr-only">{t('adminUsers.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {showMembersSkeleton || showCapabilityWait ? <UsersTableSkeletonRows /> : null}
                {showTableBody
                  ? pageItems.map((m) => {
                  const id = memberUserId(m);
                  const name = memberDisplayName(m);
                  const code = memberEmployeeCode(m);
                  const isSystemAdmin = isSystemAdminMember(m);
                  const depId = memberDepartmentId(m);
                  const teamId = memberTeamId(m);
                  const depName = structureMaps.departments.get(depId);
                  const teamName = structureMaps.teams.get(teamId);
                  const rbacReady = hasUserCache(rbacByUser, id);
                  const capabilityReady = hasUserCache(capabilityByUser, id);
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
                          <span className="min-w-0">
                            <span className="truncate font-medium text-foreground hover:underline">{name}</span>
                            {isSystemAdmin ? (
                              <span className="mt-0.5 block text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                                {t('adminNav.systemRoleBadge')}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                        {code || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{memberEmail(m)}</td>
                      <td className="px-4 py-3">
                        <AccountRoleBadge role={memberOrgRole(m)} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        {rbacReady ? (
                          <UserRoleCell labels={rbacLabels} emptyLabel={t('adminUsers.userRoleNone')} />
                        ) : (
                          <CellPlaceholder />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-[140px] truncate">{memberJobTitle(m) || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <OrgRoleCell
                          rows={orgRoleByUser[id]}
                          emptyLabel={t('adminUsers.orgRoleNone')}
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
                      <td className="px-4 py-3">
                        {capabilityReady ? (
                          <CapabilityStatusBadge status={capabilityByUser[id] || 'draft'} t={t} />
                        ) : (
                          <CellPlaceholder />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatWhen(m.lastLoginAt)}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <AdminUserActionsMenu
                          member={m}
                          onViewDetail={setDetailMember}
                          onRequestDelete={setDeleteMember}
                          disableDelete={isSystemAdmin}
                        />
                      </td>
                    </tr>
                  );
                })
                : null}
              </tbody>
            </table>
            {showTableBody && !sorted.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminUsers.noUsers')}
              </p>
            ) : null}
            {showTableBody && sorted.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                  aria-label={t('adminUsers.listPrev')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t('adminUsers.listPrev')}
                </button>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {t('adminUsers.listPage', { page: safePage, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                  aria-label={t('adminUsers.listNext')}
                >
                  {t('adminUsers.listNext')}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
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
        onCapabilityStatusChange={(userId, status) => {
          setCapabilityByUser((prev) => {
            const next = { ...prev, [userId]: status };
            capabilityByUserRef.current = next;
            return next;
          });
        }}
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
