import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import { getInitials } from '../../utils/helpers';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
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
import { adminInputClass } from './adminUserPanelUi';

const RBAC_ROLE_FILTER_ALL = 'all';
const RBAC_ROLE_FILTER_WITH = 'withRole';
const RBAC_ROLE_FILTER_WITHOUT = 'withoutRole';

function StatusDot({ member, t }) {
  const key = memberStatusKey(member);
  const color =
    key === 'active'
      ? 'bg-emerald-500'
      : key === 'locked' || key === 'mustChangePassword'
        ? 'bg-amber-500'
        : 'bg-slate-400';
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
      title={memberStatusLabel(member, t)}
    />
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
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rbacRoleFilter, setRbacRoleFilter] = useState(RBAC_ROLE_FILTER_ALL);
  const { members, loading, error, loadMembers } = useAdminMembers(orgId);

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
        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
          active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-full max-h-[min(72vh,680px)] min-h-[320px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
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
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : errorMessage ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <div className="mt-3">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => loadMembers()}
            >
              {t('adminRbac.retry')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/70 scrollbar-overlay">
            <ul className="divide-y divide-border/50">
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
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                        active ? 'bg-red-500/10' : 'hover:bg-muted/30'
                      }`}
                    >
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-[10px] font-bold text-white">
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
                      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground">
                        {memberOrgRole(m)}
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
            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
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
        </>
      )}
    </div>
  );
}
