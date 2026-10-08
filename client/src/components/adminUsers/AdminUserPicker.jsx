import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import { getInitials } from '../../utils/helpers';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  accountRoleLabel,
  memberDisplayName,
  memberEmail,
  memberHasRbacRole,
  memberIsWithoutRbacRole,
  memberMatchesQuery,
  memberOrgRole,
  memberStatusKey,
  memberStatusLabel,
  memberUserId,
} from '../../utils/adminUserUtils';
import { adminInputClass, adminPrimaryBtnClass } from './adminUserPanelUi';

const RBAC_ROLE_FILTER_ALL = 'all';
const RBAC_ROLE_FILTER_WITH = 'withRole';
const RBAC_ROLE_FILTER_WITHOUT = 'withoutRole';

const PAGER_BTN_CLASS =
  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none';

function StatusDot({ member, t }) {
  const key = memberStatusKey(member);
  const color =
    key === 'active'
      ? 'bg-success'
      : key === 'locked' || key === 'mustChangePassword'
        ? 'bg-warning'
        : 'bg-muted-foreground';
  const label = memberStatusLabel(member, t);
  return (
    <>
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} title={label} aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * @param {{
 *   orgId: string,
 *   selectedUserId?: string,
 *   onSelect?: (userId: string) => void,
 *   hint?: string,
 *   filterFn?: (member: object) => boolean,
 *   subtitleFn?: (member: object) => string,
 *   emptyLabel?: string,
 *   pageSize?: number,
 *   rbacAssignments?: { byUser?: Record<string, unknown[]>, ready?: boolean },
 *   showRbacRoleFilter?: boolean,
 *   fillHeight?: boolean,
 * }} props
 */
export default function AdminUserPicker({
  orgId,
  selectedUserId,
  onSelect,
  hint,
  filterFn,
  subtitleFn,
  emptyLabel,
  pageSize = 0,
  rbacAssignments,
  showRbacRoleFilter = false,
  fillHeight = false,
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rbacRoleFilter, setRbacRoleFilter] = useState(RBAC_ROLE_FILTER_ALL);
  const { members, loading, error, loadMembers } = useAdminMembers(orgId, { view: 'directory' });

  const activeId = String(selectedUserId || searchParams.get('userId') || '').trim();
  const errorMessage = error
    ? resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') })
    : '';

  const assignmentsByUser = rbacAssignments?.byUser || null;
  const assignmentsReady = Boolean(rbacAssignments?.ready);

  const filtered = useMemo(() => {
    let base = members;
    if (typeof filterFn === 'function') {
      base = base.filter(filterFn);
    } else if (showRbacRoleFilter && assignmentsReady && rbacRoleFilter !== RBAC_ROLE_FILTER_ALL) {
      base = base.filter((m) =>
        rbacRoleFilter === RBAC_ROLE_FILTER_WITHOUT
          ? memberIsWithoutRbacRole(m, assignmentsByUser)
          : memberHasRbacRole(m, assignmentsByUser)
      );
    }
    return base.filter((m) => memberMatchesQuery(m, query));
  }, [
    members,
    query,
    filterFn,
    showRbacRoleFilter,
    assignmentsReady,
    rbacRoleFilter,
    assignmentsByUser,
  ]);

  const perPage = Math.max(0, Number(pageSize) || 0);
  const totalPages = perPage > 0 ? Math.max(1, Math.ceil(filtered.length / perPage)) : 1;
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [query, rbacRoleFilter, filterFn, orgId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(() => {
    if (perPage <= 0) return filtered;
    const start = (safePage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, perPage, safePage]);

  const pick = (userId) => {
    const id = String(userId || '').trim();
    if (!id) return;
    onSelect?.(id);
    const next = new URLSearchParams(searchParams);
    next.set('userId', id);
    setSearchParams(next, { replace: true });
  };

  const resolveSubtitle = (m) => {
    if (typeof subtitleFn === 'function') return subtitleFn(m);
    const email = memberEmail(m);
    if (showRbacRoleFilter && assignmentsReady) {
      const badge = memberHasRbacRole(m, assignmentsByUser)
        ? t('adminRbac.assignHasRoleBadge')
        : t('adminRbac.assignRolelessBadge');
      return `${email} · ${badge}`;
    }
    return email;
  };

  const roleFilterBtn = (value, label) => {
    const active = rbacRoleFilter === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setRbacRoleFilter(value)}
        aria-pressed={active}
        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted text-muted-foreground hover:bg-primary-subtle hover:text-foreground'
        }`}
      >
        {label}
      </button>
    );
  };

  const shellClass = fillHeight
    ? 'flex h-full max-h-[calc(100dvh-10rem)] min-h-[280px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm'
    : 'flex h-full max-h-[min(72vh,680px)] min-h-[320px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm';

  return (
    <div className={shellClass}>
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{t('adminUsers.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="relative mb-3 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('adminUsers.searchPlaceholder')}
          aria-label={t('adminUsers.searchPlaceholder')}
          maxLength={100}
          className={`${adminInputClass()} pl-9`}
        />
      </div>
      {showRbacRoleFilter ? (
        <div className="mb-3 flex flex-wrap gap-1.5 shrink-0">
          {roleFilterBtn(RBAC_ROLE_FILTER_ALL, t('adminUsers.rbacFilterAll'))}
          {roleFilterBtn(RBAC_ROLE_FILTER_WITH, t('adminUsers.rbacFilterWithRole'))}
          {roleFilterBtn(RBAC_ROLE_FILTER_WITHOUT, t('adminUsers.rbacFilterWithoutRole'))}
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('common.loading')}>
          {Array.from({ length: 5 }, (_, idx) => (
            <div key={idx} className="h-11 rounded-lg bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      ) : errorMessage ? (
        <div className="rounded-xl border border-destructive bg-card p-3" role="alert">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <div className="mt-3">
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadMembers()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {paged.map((m) => {
                const id = memberUserId(m);
                const name = memberDisplayName(m);
                const active = id === activeId;
                const subtitle = resolveSubtitle(m);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => pick(id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        active ? 'bg-primary-subtle' : 'hover:bg-muted'
                      }`}
                    >
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                          {getInitials(name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <StatusDot member={m} t={t} />
                          <span className="truncate text-sm font-medium text-foreground">{name}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {accountRoleLabel(memberOrgRole(m), t)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!paged.length ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyLabel || t('adminUsers.noUsers')}
              </p>
            ) : null}
          </div>
          {perPage > 0 && filtered.length > 0 ? (
            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
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
        </>
      )}
    </div>
  );
}
