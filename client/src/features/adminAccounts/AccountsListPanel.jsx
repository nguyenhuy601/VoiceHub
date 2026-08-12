import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { getInitials } from '../../utils/helpers';
import {
  memberDisplayName,
  memberEmail,
  memberUserId,
} from '../../utils/adminUserUtils';

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

export default function AccountsListPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { members, loading } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = memberDisplayName(m).toLowerCase();
      const email = memberEmail(m).toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, query]);

  const openDetail = (userId) => {
    navigate(`/app/admin/accounts/detail?userId=${encodeURIComponent(userId)}`);
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.list')} hint={t('adminAccounts.listHint')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminAccounts.searchPlaceholder')}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('adminAccounts.listCount', { n: filtered.length, total: members.length })}
        </p>
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
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filtered.length ? (
                filtered.map((member) => {
                  const userId = memberUserId(member);
                  const isLocked = member.isActive === false || Boolean(member.isLocked);
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
                          ok={!isLocked}
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
                        {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-xs">{member.systemRole || 'employee'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-red-500 hover:underline"
                          onClick={() => openDetail(userId)}
                        >
                          {t('adminAccounts.openDetail')}
                        </button>
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
