import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import AdminUserActionsMenu from '../../components/adminUsers/AdminUserActionsMenu';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useDebouncedValue } from '../search/useDebouncedValue';
import { useAppStrings } from '../../locales/appStrings';
import { getInitials } from '../../utils/helpers';
import {
  memberDisplayName,
  memberEmail,
  memberUserId,
} from '../../utils/adminUserUtils';

const ACCOUNTS_LIST_PAGE_SIZE = 10;

function isAccountInactive(member) {
  return member?.isActive === false || Boolean(member?.isLocked);
}

function systemRoleLabel(member, t) {
  const role = String(member?.systemRole || 'employee').trim().toLowerCase();
  if (role === 'admin') return t('adminAccounts.systemAdmin');
  return t('adminAccounts.employee');
}

function AuthBadge({ ok, yesLabel, noLabel }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
        ok
          ? 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
          : 'bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-200'
      }`}
    >
      {ok ? yesLabel : noLabel}
    </span>
  );
}

function AccountsTableSkeletonRows({ rows = ACCOUNTS_LIST_PAGE_SIZE }) {
  return Array.from({ length: rows }, (_, rowIdx) => (
    <tr key={`sk-${rowIdx}`}>
      {Array.from({ length: 7 }, (_, colIdx) => (
        <td key={colIdx} className="px-3 py-2.5">
          <span className="inline-block h-4 w-full max-w-[7rem] animate-pulse rounded bg-muted" />
        </td>
      ))}
    </tr>
  ));
}

export default function AccountsListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { members, loading, error: membersError, loadMembers } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);

  useEffect(() => {
    setPage(1);
  }, [orgId, debouncedQuery, statusFilter]);

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

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter === 'active' && isAccountInactive(m)) return false;
      if (statusFilter === 'inactive' && !isAccountInactive(m)) return false;
      if (!q) return true;
      const name = memberDisplayName(m).toLowerCase();
      const email = memberEmail(m).toLowerCase();
      const roleLabel = systemRoleLabel(m, t).toLowerCase();
      return name.includes(q) || email.includes(q) || roleLabel.includes(q);
    });
  }, [members, debouncedQuery, statusFilter, t]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ACCOUNTS_LIST_PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * ACCOUNTS_LIST_PAGE_SIZE;
    return filtered.slice(start, start + ACCOUNTS_LIST_PAGE_SIZE);
  }, [filtered, safePage]);

  const showMembersError = Boolean(membersError) && !members.length && !loading;
  const showMembersSkeleton = loading && !members.length;
  const activeFilterCount = statusFilter ? 1 : 0;

  return (
    <AdminUserPanelShell
      wide
      title={t('adminDomains.accounts.list')}
      hint={`${t('adminAccounts.listHint')} · ${t('adminAccounts.listCount', {
        n: filtered.length,
        total: members.length,
      })} · ${t('adminUsers.listPageSizeHint', { size: ACCOUNTS_LIST_PAGE_SIZE })}`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminAccounts.searchPlaceholder')}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="relative shrink-0" ref={filtersRef}>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="accounts-list-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
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
              id="accounts-list-filters"
              className="absolute right-0 z-20 mt-2 w-[min(calc(100vw-2rem),16rem)] space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg"
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                aria-label={t('adminUsers.filterAllStatus')}
              >
                <option value="">{t('adminUsers.filterAllStatus')}</option>
                <option value="active">{t('adminUsers.statusActive')}</option>
                <option value="inactive">{t('adminUsers.statusInactive')}</option>
              </select>
              {activeFilterCount ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="w-full rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  {t('adminUsers.filtersClear')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">{t('adminUsers.colUser')}</th>
                <th className="px-3 py-2.5">{t('adminAccounts.colEmailVerified')}</th>
                <th className="px-3 py-2.5">{t('adminAccounts.colLocked')}</th>
                <th className="px-3 py-2.5">{t('adminAccounts.colMustChange')}</th>
                <th className="px-3 py-2.5">{t('adminUsers.colLastLogin')}</th>
                <th className="px-3 py-2.5">{t('adminAccounts.colSystemRole')}</th>
                <th className="w-12 px-2 py-2.5 text-center">
                  <span className="sr-only">{t('adminUsers.colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {showMembersError ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">{t('companyAdmin.loadMembersFail')}</p>
                    <button
                      type="button"
                      onClick={() => loadMembers()}
                      className="mt-3 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-500"
                    >
                      {t('adminUsers.listRetry')}
                    </button>
                  </td>
                </tr>
              ) : showMembersSkeleton ? (
                <AccountsTableSkeletonRows />
              ) : pageItems.length ? (
                pageItems.map((member) => {
                  const userId = memberUserId(member);
                  const inactive = isAccountInactive(member);
                  const isVerified = member.isEmailVerified !== false;
                  return (
                    <tr key={userId} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-xs font-semibold text-red-600">
                            {getInitials(memberDisplayName(member))}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{memberDisplayName(member)}</p>
                            <p className="truncate text-xs text-muted-foreground">{memberEmail(member) || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <AuthBadge
                          ok={isVerified}
                          yesLabel={t('adminAccounts.verifiedYes')}
                          noLabel={t('adminAccounts.verifiedNo')}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <AuthBadge
                          ok={!inactive}
                          yesLabel={t('adminUsers.statusActive')}
                          noLabel={t('adminUsers.statusInactive')}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {member.mustChangePassword ? (
                          <span className="inline-flex rounded-full bg-sky-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-500/25 dark:text-sky-200">
                            {t('adminUsers.statusMustChangePassword')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {formatWhen(member.lastLoginAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{systemRoleLabel(member, t)}</td>
                      <td className="px-2 py-2.5 text-center">
                        <AdminUserActionsMenu member={member} variant="account" />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t('adminUsers.noUsers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!showMembersError && !showMembersSkeleton && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3">
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

      <p className="mt-3 text-xs text-muted-foreground">
        {t('adminAccounts.listFootnote')}{' '}
        <Link to="/app/admin/users" className="font-medium text-red-500 hover:underline">
          {t('adminDomains.users.title')}
        </Link>
      </p>
    </AdminUserPanelShell>
  );
}
