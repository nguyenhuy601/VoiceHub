import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  History,
} from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import {
  memberDisplayName,
  memberEmail,
  memberUserId,
  unwrapApi,
} from '../../utils/adminUserUtils';

function ActionLink({ to, icon: Icon, children }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {children}
    </Link>
  );
}

export default function AccountDetailPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { members } = useAdminMembers(orgId);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const memberRow = members.find((m) => memberUserId(m) === userId);
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';

  useEffect(() => {
    if (!orgId || !userId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminUserAPI.getAuthSummary(orgId, userId);
        if (!cancelled) setSummary(unwrapApi(res)?.data ?? unwrapApi(res));
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  const displayName = memberRow ? memberDisplayName(memberRow) : userId;
  const email = summary?.email || (memberRow ? memberEmail(memberRow) : '');

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.detail')} hint={t('adminAccounts.detailHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.detailPickerHint')} />
        <AdminUserFormCard title={displayName || t('adminDomains.accounts.detail')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminAccounts.colEmail')}</p>
                  <p className="mt-1 text-sm font-medium">{email || '—'}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminAccounts.colSystemRole')}</p>
                  <p className="mt-1 text-sm font-medium capitalize">{summary?.systemRole || 'employee'}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminAccounts.emailVerified')}</p>
                  <p className="mt-1 text-sm font-medium">
                    {summary?.isEmailVerified ? t('adminAccounts.verifiedYes') : t('adminAccounts.verifiedNo')}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminUsers.colStatus')}</p>
                  <p className="mt-1 text-sm font-medium">
                    {summary?.isActive === false ? t('adminUsers.statusInactive') : t('adminUsers.statusActive')}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminUsers.colLastLogin')}</p>
                  <p className="mt-1 text-sm font-medium">
                    {summary?.lastLoginAt ? new Date(summary.lastLoginAt).toLocaleString() : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">{t('adminAccounts.loginAttempts')}</p>
                  <p className="mt-1 text-sm font-medium">{summary?.loginAttempts ?? 0}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('adminAccounts.quickActions')}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionLink to={`/app/admin/accounts/lock${q}`} icon={Lock}>
                    {t('adminDomains.accounts.lock')}
                  </ActionLink>
                  <ActionLink to={`/app/admin/accounts/reset-password${q}`} icon={Mail}>
                    {t('adminDomains.accounts.resetPassword')}
                  </ActionLink>
                  <ActionLink to={`/app/admin/accounts/force-password${q}`} icon={KeyRound}>
                    {t('adminDomains.accounts.forcePassword')}
                  </ActionLink>
                  <ActionLink to={`/app/admin/accounts/set-password${q}`} icon={KeyRound}>
                    {t('adminDomains.accounts.setPassword')}
                  </ActionLink>
                  <ActionLink to={`/app/admin/accounts/revoke-sessions${q}`} icon={LogOut}>
                    {t('adminDomains.accounts.revokeSessions')}
                  </ActionLink>
                  <ActionLink
                    to={`/app/admin/accounts/resend-verification${q}`}
                    icon={MailCheck}
                  >
                    {t('adminDomains.accounts.resendVerification')}
                  </ActionLink>
                  <ActionLink to={`/app/admin/accounts/login-history${q}`} icon={History}>
                    {t('adminDomains.accounts.loginHistory')}
                  </ActionLink>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('adminAccounts.profileLinkHint')}{' '}
                <Link to={`/app/admin/users/edit${q}`} className="font-medium text-red-500 hover:underline">
                  {t('adminDomains.users.edit')}
                </Link>
              </p>
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
