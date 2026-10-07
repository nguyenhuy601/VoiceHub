import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import AdminUserActionsMenu from '../../components/adminUsers/AdminUserActionsMenu';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
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

const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PAGER_BTN_CLASS = `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${FOCUS_RING_CLASS}`;

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
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        ok ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
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
          <span className="inline-block h-4 w-full max-w-[7rem] rounded bg-muted motion-safe:animate-pulse" />
        </td>
      ))}
    </tr>
  ));
}

export default function AccountsListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  // Wave 1: Accounts cần auth flags → admin_table (directory đã omit).
  const { members, loading, error: membersError, loadMembers } = useAdminMembers(orgId, {
    view: 'admin_table',
  });
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const filtersButtonRef = useRef(null);

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
      if (e.key !== 'Escape') return;
      setFiltersOpen(false);
      filtersButtonRef.current?.focus();
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
  const hasRows = !showMembersError && !showMembersSkeleton && pageItems.length > 0;

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
            aria-label={t('adminAccounts.searchPlaceholder')}
            maxLength={120}
            className={`w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors duration-150 focus:ring-2 focus:ring-ring motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
          />
        </div>
        <div className="relative shrink-0" ref={filtersRef}>
          <button
            ref={filtersButtonRef}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="accounts-list-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t('adminUsers.filters')}
            {activeFilterCount ? (
              <span
                className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                title={t('adminUsers.filtersActive', { n: activeFilterCount })}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {filtersOpen ? (
            <div
              id="accounts-list-filters"
              role="dialog"
              aria-label={t('adminUsers.filters')}
              className="absolute right-0 z-20 mt-2 w-[min(calc(100vw-2rem),16rem)] space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg motion-safe:animate-fade-in-fast"
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition-colors duration-150 motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
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
                  className={`w-full rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none ${FOCUS_RING_CLASS}`}
                >
                  {t('adminUsers.filtersClear')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <AdminDenseTableCard>
        <AdminDenseTableScroll>
          {hasRows ? (
            <AdminDenseMobileList
              items={pageItems}
              getKey={memberUserId}
              ariaLabel={t('adminDomains.accounts.list')}
              renderTitle={(member) => memberDisplayName(member)}
              renderMeta={(member) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 truncate">{memberEmail(member) || '—'}</span>
                  <AuthBadge
                    ok={!isAccountInactive(member)}
                    yesLabel={t('adminUsers.statusActive')}
                    noLabel={t('adminUsers.statusInactive')}
                  />
                  <span>{systemRoleLabel(member, t)}</span>
                </span>
              )}
              renderActions={(member) => <AdminUserActionsMenu member={member} variant="account" />}
            />
          ) : null}
          <table className={`min-w-full text-sm ${hasRows ? 'hidden md:table' : ''}`}>
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
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
            <tbody className="divide-y divide-border">
              {showMembersError ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center" role="alert">
                    <p className="text-sm text-destructive">{t('companyAdmin.loadMembersFail')}</p>
                    <button
                      type="button"
                      onClick={() => loadMembers()}
                      className={adminPrimaryBtnClass('mt-3 px-3.5 py-2')}
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
                    <tr key={userId} className="transition-colors duration-150 hover:bg-muted motion-reduce:transition-none">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
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
                          <span className="inline-flex rounded-full bg-info-bg px-2.5 py-0.5 text-[11px] font-semibold text-info">
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
        </AdminDenseTableScroll>
        {!showMembersError && !showMembersSkeleton && filtered.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={PAGER_BTN_CLASS}
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
              className={PAGER_BTN_CLASS}
              aria-label={t('adminUsers.listNext')}
            >
              {t('adminUsers.listNext')}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </AdminDenseTableCard>

      <p className="mt-3 text-xs text-muted-foreground">
        {t('adminAccounts.listFootnote')}{' '}
        <Link to="/app/admin/users" className={`rounded font-medium text-primary hover:underline ${FOCUS_RING_CLASS}`}>
          {t('adminDomains.users.title')}
        </Link>
      </p>
    </AdminUserPanelShell>
  );
}
