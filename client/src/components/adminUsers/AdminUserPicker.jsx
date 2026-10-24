import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import UserAvatar from '../Shared/UserAvatar';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import orgRbacAPI from '../../services/api/orgRbacAPI';
import {
  memberDisplayName,
  memberEmail,
  memberHasRbacRole,
  memberIsWithoutRbacRole,
  memberMatchesQuery,
  memberStatusKey,
  memberStatusLabel,
  memberUserId,
} from '../../utils/adminUserUtils';
import {
  buildOrgRoleRowsMapFromAssignments,
  effectiveOrgRoleLabel,
} from '../../utils/effectiveOrgRoleLabel';
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
 *   scrollLoad?: boolean,
 *   scrollPageSize?: number,
 *   selectionMode?: 'single' | 'multiple',
 *   selectedUserIds?: string[],
 *   onSelectedUserIdsChange?: (userIds: string[]) => void,
 *   rbacAssignments?: { byUser?: Record<string, unknown[]>, ready?: boolean },
 *   orgRoleByUser?: Record<string, Array<{ label?: string, roleKey?: string }>>,
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
  scrollLoad = false,
  scrollPageSize = 20,
  selectionMode = 'single',
  selectedUserIds,
  onSelectedUserIdsChange,
  rbacAssignments,
  orgRoleByUser: orgRoleByUserProp,
  showRbacRoleFilter = false,
  fillHeight = false,
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(scrollPageSize);
  const [internalSelectedIds, setInternalSelectedIds] = useState([]);
  const [rbacRoleFilter, setRbacRoleFilter] = useState(RBAC_ROLE_FILTER_ALL);
  const [loadedOrgRoleByUser, setLoadedOrgRoleByUser] = useState({});
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const multiple = selectionMode === 'multiple';
  const selectedIds = multiple
    ? (Array.isArray(selectedUserIds) ? selectedUserIds : internalSelectedIds)
    : [];
  const { members, loading, error, loadMembers } = useAdminMembers(orgId, { view: 'directory' });

  const activeId = String(selectedUserId || searchParams.get('userId') || '').trim();
  const errorMessage = error
    ? resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') })
    : '';

  const assignmentsByUser = rbacAssignments?.byUser || null;
  const assignmentsReady = Boolean(rbacAssignments?.ready);
  const orgRoleByUser = orgRoleByUserProp || loadedOrgRoleByUser;

  useEffect(() => {
    if (orgRoleByUserProp || !orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [assignRes, positionAssignRes] = await Promise.all([
          orgRoleCatalogAPI.listAssignments(orgId).catch(() => null),
          orgRbacAPI.listAssignments(orgId, { status: 'active' }).catch(() => null),
        ]);
        // apiClient đã unwrap → { success, data }.
        const assignments =
          assignRes?.data?.assignments ||
          assignRes?.assignments ||
          [];
        const positionAssignments =
          positionAssignRes?.data?.assignments ||
          positionAssignRes?.assignments ||
          [];
        const roleFromPosition = {};
        for (const row of Array.isArray(positionAssignments) ? positionAssignments : []) {
          const uid = String(row?.userId || '').trim();
          const labels = Array.isArray(row?.orgRoleLabels)
            ? row.orgRoleLabels.filter(Boolean)
            : [];
          const keys = Array.isArray(row?.orgRoleKeys) ? row.orgRoleKeys.filter(Boolean) : [];
          if (!uid || (!labels.length && !keys.length)) continue;
          roleFromPosition[uid] = (keys.length ? keys : labels).map((keyOrLabel, i) => ({
            roleKey: keys[i] || undefined,
            label: labels[i] || labels[0] || keyOrLabel,
          }));
        }
        if (!cancelled) {
          setLoadedOrgRoleByUser(
            buildOrgRoleRowsMapFromAssignments(assignments, roleFromPosition)
          );
        }
      } catch {
        if (!cancelled) setLoadedOrgRoleByUser({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, orgRoleByUserProp]);

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
    setVisibleCount(scrollPageSize);
  }, [query, rbacRoleFilter, filterFn, orgId, scrollPageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(() => {
    if (scrollLoad) return filtered.slice(0, Math.max(scrollPageSize, visibleCount));
    if (perPage <= 0) return filtered;
    const start = (safePage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, perPage, safePage, scrollLoad, scrollPageSize, visibleCount]);

  const hasMoreScroll = scrollLoad && paged.length < filtered.length;

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!scrollLoad || !hasMoreScroll || !root || !target) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + scrollPageSize);
        }
      },
      { root, rootMargin: '48px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollLoad, hasMoreScroll, scrollPageSize, paged.length]);

  const setSelectedIds = (nextIds) => {
    const uniqueIds = [...new Set(nextIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!Array.isArray(selectedUserIds)) setInternalSelectedIds(uniqueIds);
    onSelectedUserIdsChange?.(uniqueIds);
  };

  const toggleUser = (userId) => {
    const id = String(userId || '').trim();
    if (!id) return;
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter((item) => item !== id));
    else setSelectedIds([...selectedIds, id]);
  };

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
          {multiple && filtered.length ? (
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {t('adminRbac.orgRoleBulkSelected', { count: selectedIds.length })}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedIds(filtered.map((member) => memberUserId(member)))}
                >
                  {t('adminRbac.orgRolePickerSelectAll')}
                </button>
                <button
                  type="button"
                  className="font-medium text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  disabled={!selectedIds.length}
                  onClick={() => setSelectedIds([])}
                >
                  {t('adminRbac.orgRolePickerClear')}
                </button>
              </span>
            </div>
          ) : null}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {paged.map((m) => {
                const id = memberUserId(m);
                const name = memberDisplayName(m);
                const picked = id === activeId;
                const checked = selectedIds.includes(id);
                const subtitle = resolveSubtitle(m);
                const rowClass = `flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  picked ? 'bg-primary-subtle' : 'hover:bg-muted'
                }`;
                const body = (
                  <>
                    <UserAvatar
                      avatar={m.avatar}
                      userId={id}
                      name={name}
                      size="chip"
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <StatusDot member={m} t={t} />
                        <span className="truncate text-sm font-medium text-foreground">{name}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {effectiveOrgRoleLabel(m, {
                        orgRoleRows: orgRoleByUser[memberUserId(m)] || [],
                        t,
                      })}
                    </span>
                  </>
                );
                return (
                  <li key={id}>
                    {multiple ? (
                      <div className="flex items-stretch">
                        <label className="flex shrink-0 items-center px-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={checked}
                            aria-label={name}
                            onChange={() => toggleUser(id)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => pick(id)}
                          aria-current={picked ? 'true' : undefined}
                          className={rowClass}
                        >
                          {body}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pick(id)}
                        aria-current={picked ? 'true' : undefined}
                        className={rowClass}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {hasMoreScroll ? <div ref={sentinelRef} className="h-8" aria-hidden /> : null}
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
