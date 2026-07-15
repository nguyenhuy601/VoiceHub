import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import { getInitials } from '../../utils/helpers';
import {
  memberDisplayName,
  memberEmail,
  memberMatchesQuery,
  memberOrgRole,
  memberStatusKey,
  memberStatusLabel,
  memberUserId,
} from '../../utils/adminUserUtils';
import { adminInputClass } from './adminUserPanelUi';

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
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { members, loading } = useAdminMembers(orgId);

  const activeId = String(selectedUserId || searchParams.get('userId') || '').trim();

  const filtered = useMemo(() => {
    const base = typeof filterFn === 'function' ? members.filter(filterFn) : members;
    return base.filter((m) => memberMatchesQuery(m, query));
  }, [members, query, filterFn]);

  const pick = (userId) => {
    const id = String(userId || '').trim();
    if (!id) return;
    onSelect?.(id);
    const next = new URLSearchParams(searchParams);
    next.set('userId', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t('adminUsers.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('adminUsers.searchPlaceholder')}
          className={`${adminInputClass()} pl-9`}
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70">
          <ul className="divide-y divide-border/50">
            {filtered.map((m) => {
              const id = memberUserId(m);
              const name = memberDisplayName(m);
              const active = id === activeId;
              const subtitle = typeof subtitleFn === 'function' ? subtitleFn(m) : memberEmail(m);
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
          {!filtered.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyLabel || t('adminUsers.noUsers')}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
