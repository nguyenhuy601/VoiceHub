import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { GradientButton } from '../../components/Shared';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMembers from '../../hooks/useAdminMembers';
import {
  memberDisplayName,
  memberEmail,
  memberOrgRole,
  memberStatusLabel,
  memberUserId,
} from '../../utils/adminUserUtils';

const ACTION_LINKS = [
  { path: '/app/admin/users/edit', labelKey: 'adminDomains.users.edit' },
  { path: '/app/admin/users/lock', labelKey: 'adminDomains.users.lock' },
  { path: '/app/admin/users/delete', labelKey: 'adminDomains.users.delete' },
  { path: '/app/admin/users/reset-password', labelKey: 'adminDomains.users.resetPassword' },
  { path: '/app/admin/users/force-password', labelKey: 'adminDomains.users.forcePassword' },
  { path: '/app/admin/users/assign-org', labelKey: 'adminDomains.users.assignOrg' },
  { path: '/app/admin/users/login-history', labelKey: 'adminDomains.users.loginHistory' },
];

export default function UsersListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { members, loading } = useAdminMembers(orgId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const id = memberUserId(m);
      return (
        memberDisplayName(m).toLowerCase().includes(q) ||
        memberEmail(m).toLowerCase().includes(q) ||
        memberOrgRole(m).includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('adminDomains.users.list')}</h2>
          <p className="text-sm text-muted-foreground">{t('adminUsers.listHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/users/create">
            <GradientButton type="button">{t('adminDomains.users.create')}</GradientButton>
          </Link>
          <Link to="/app/admin/users/import">
            <GradientButton type="button" variant="secondary">
              {t('adminDomains.users.import')}
            </GradientButton>
          </Link>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminUsers.searchPlaceholder')}
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('companyAdmin.colName')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colEmail')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colRole')}</th>
                <th className="px-3 py-2">{t('adminUsers.colStatus')}</th>
                <th className="px-3 py-2">{t('adminUsers.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const id = memberUserId(m);
                return (
                  <tr key={id} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2 font-medium">{memberDisplayName(m)}</td>
                    <td className="px-3 py-2">{memberEmail(m)}</td>
                    <td className="px-3 py-2">{memberOrgRole(m)}</td>
                    <td className="px-3 py-2">{memberStatusLabel(m, t)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {ACTION_LINKS.map((link) => (
                          <Link
                            key={link.path}
                            to={`${link.path}?userId=${encodeURIComponent(id)}`}
                            className="text-xs font-medium text-red-400 hover:text-red-300"
                          >
                            {t(link.labelKey)}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminUsers.noUsers')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
