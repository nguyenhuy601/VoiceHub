import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { resolveEnrichedMemberContact } from '../../features/search/enrichOrgMembersContact';
import UserAvatar from '../Shared/UserAvatar';

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || value.userId || '');
  return String(value);
}

function personFromUnknown(value) {
  if (!value || typeof value !== 'object') return null;
  return value;
}

function looksLikeRawIdFallback(displayName, userId) {
  const name = String(displayName || '').trim();
  const id = String(userId || '').trim();
  if (!name || !id) return false;
  return name === id || name === id.slice(-6);
}

/**
 * Thành viên phòng ban — directory Resource Pool (không phải Project Role).
 */
export default function DepartmentMembersPanel({
  department = null,
  orgMembers = [],
  isDarkMode = false,
  departmentName = '',
}) {
  const { t } = useAppStrings();
  const [query, setQuery] = useState('');
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const title = isDarkMode ? 'text-white' : 'text-foreground';
  const scopeName =
    String(departmentName || '').trim() ||
    String(department?.name || department?.displayName || '').trim();

  const rows = useMemo(() => {
    const byId = new Map();
    (orgMembers || []).forEach((m) => {
      const id = asId(m?.userId || m?.user || m);
      if (id) byId.set(id, m);
    });

    const ids = new Set();
    const headId = asId(department?.head);
    if (headId) ids.add(headId);
    (department?.members || []).forEach((m) => {
      const id = asId(m);
      if (id) ids.add(id);
    });

    const memberFallback = t('organizations.memberFallbackShort');

    return [...ids]
      .map((id) => {
        const membership = byId.get(id);
        const userObj =
          membership?.user && typeof membership.user === 'object' ? membership.user : null;
        const fromDeptHead =
          typeof department?.head === 'object' && asId(department.head) === id
            ? department.head
            : null;
        const fromDeptMember = (department?.members || []).find(
          (m) => typeof m === 'object' && asId(m) === id
        );
        const profile =
          userObj || personFromUnknown(fromDeptHead) || personFromUnknown(fromDeptMember) || null;

        const contact = resolveEnrichedMemberContact(profile, membership || {}, {
          userId: id,
          fallback: memberFallback,
        });

        // Ưu tiên field đã hydrate trên membership (OrganizationsPage enrich).
        const hydratedName = String(
          membership?.displayName || membership?.fullName || membership?.username || ''
        ).trim();
        const hydratedEmail = String(membership?.email || contact.email || '').trim();

        const rawFallback = looksLikeRawIdFallback(contact.displayName, id);
        let name = hydratedName || (!rawFallback ? contact.displayName : '');
        if (!name && hydratedEmail) name = hydratedEmail.split('@')[0];
        if (!name) name = memberFallback;

        const stillIncomplete =
          !hydratedName &&
          (rawFallback || name === memberFallback) &&
          !hydratedEmail;

        return {
          id,
          name,
          role: headId === id ? 'head' : String(membership?.role || 'member').toLowerCase(),
          avatarUrl:
            membership?.avatar || contact.avatar || profile?.avatarUrl || profile?.avatar || '',
          email: hydratedEmail,
          profileIncomplete: stillIncomplete,
        };
      })
      .sort((a, b) => {
        if (a.role === 'head' && b.role !== 'head') return -1;
        if (b.role === 'head' && a.role !== 'head') return 1;
        return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
      });
  }, [department, orgMembers, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.name).toLowerCase().includes(q) || String(r.email || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const headCount = rows.filter((r) => r.role === 'head').length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Users size={18} className="text-sky-600 dark:text-sky-400" />
        <h3 className={`text-sm font-bold ${title}`}>{t('workspace.moduleMembers')}</h3>
        <span className={`text-xs ${muted}`}>({rows.length})</span>
      </div>
      <p className={`mb-3 text-[0.6875rem] leading-relaxed ${muted}`}>
        {scopeName
          ? t('workspace.deptMembersHint', { name: scopeName })
          : t('workspace.deptMembersHintGeneric')}
      </p>

      {rows.length > 0 ? (
        <label className="relative mb-3 block">
          <Search
            size={14}
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${muted}`}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workspace.deptMembersSearchPh')}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            aria-label={t('workspace.deptMembersSearchPh')}
          />
        </label>
      ) : null}

      {headCount > 0 && !query.trim() ? (
        <p className={`mb-2 text-[0.625rem] font-semibold uppercase tracking-wide ${muted}`}>
          {t('workspace.deptMembersPoolLabel')}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.deptMembersEmpty')}
        </p>
      ) : filtered.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
          {t('workspace.deptMembersNoMatch')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {filtered.map((row) => (
            <li
              key={row.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                row.role === 'head'
                  ? 'border-primary/25 bg-primary/5'
                  : 'border-border bg-surface'
              }`}
            >
              <UserAvatar
                name={row.name}
                avatar={row.avatarUrl}
                userId={row.id}
                size="md"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`truncate text-sm font-semibold ${title}`}>{row.name}</p>
                  {row.role === 'head' ? (
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-primary">
                      {t('workspace.deptMembersHeadBadge')}
                    </span>
                  ) : (
                    <span className={`text-[0.625rem] font-medium uppercase tracking-wide ${muted}`}>
                      {t('workspace.deptMembersMemberBadge')}
                    </span>
                  )}
                  {row.profileIncomplete ? (
                    <span className={`rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:text-amber-300`}>
                      {t('workspace.deptMembersProfileIncomplete')}
                    </span>
                  ) : null}
                </div>
                {row.email ? (
                  <p className={`mt-0.5 truncate text-xs ${muted}`}>{row.email}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
