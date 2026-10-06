import { Link, useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  History,
  ShieldCheck,
} from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import {
  memberDisplayName,
  memberEmail,
  memberUserId,
} from '../../utils/adminUserUtils';
import { adminUserHubLink } from '../../utils/adminHubLinks';
import { AccountLoadError, accountInfoCardClass, useAccountAuthSummary } from './accountPanelParts';

function ActionLink({ to, icon: Icon, children }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </Link>
  );
}

function InfoCard({ label, children }) {
  return (
    <div className={accountInfoCardClass()}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{children}</p>
    </div>
  );
}

function formatDateTime(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

export default function AccountDetailPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { members } = useAdminMembers(orgId, { view: 'directory' });
  const { summary, loading, loadError, reload } = useAccountAuthSummary(orgId, userId, 'adminAccounts.loadFail');

  const memberRow = members.find((m) => memberUserId(m) === userId);
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';

  const displayName = memberRow ? memberDisplayName(memberRow) : userId;
  const email = summary?.email || (memberRow ? memberEmail(memberRow) : '');
  const lockUntilActive = summary?.lockUntil && new Date(summary.lockUntil) > new Date();

  let lockLabel = t('adminAccounts.notLocked');
  if (lockUntilActive) {
    lockLabel = t('adminAccounts.rateLockedUntil', { time: formatDateTime(summary.lockUntil, locale) });
  } else if (summary?.isLocked) {
    lockLabel = t('adminAccounts.lockedByAdmin');
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.detail')} hint={t('adminAccounts.detailHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.detailPickerHint')} />
        <AdminUserFormCard title={displayName || t('adminDomains.accounts.detail')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              {t('common.loading')}
            </p>
          ) : loadError ? (
            <AccountLoadError message={loadError} onRetry={reload} />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard label={t('adminAccounts.colEmail')}>{email || '—'}</InfoCard>
                <InfoCard label={t('adminAccounts.colSystemRole')}>
                  {summary?.systemRole === 'admin' ? t('adminAccounts.systemAdmin') : t('adminAccounts.employee')}
                </InfoCard>
                <InfoCard label={t('adminAccounts.emailVerified')}>
                  {summary?.isEmailVerified ? t('adminAccounts.verifiedYes') : t('adminAccounts.verifiedNo')}
                </InfoCard>
                <InfoCard label={t('adminUsers.colStatus')}>
                  {summary?.pendingActivation
                    ? t('adminAccounts.statusPendingActivation')
                    : summary?.isLocked
                      ? t('adminUsers.statusLocked')
                      : summary?.isActive === false
                        ? t('adminUsers.statusInactive')
                        : t('adminUsers.statusActive')}
                </InfoCard>
                <InfoCard label={t('adminAccounts.colLocked')}>{lockLabel}</InfoCard>
                <InfoCard label={t('adminAccounts.colMustChange')}>
                  {summary?.mustChangePassword ? t('adminAccounts.flagYes') : t('adminAccounts.flagNo')}
                </InfoCard>
                <InfoCard label={t('adminUsers.colLastLogin')}>{formatDateTime(summary?.lastLoginAt, locale)}</InfoCard>
                <InfoCard label={t('adminAccounts.loginAttempts')}>{summary?.loginAttempts ?? 0}</InfoCard>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('adminAccounts.quickActions')}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionLink to={adminUserHubLink('/app/admin/accounts/access', userId, 'lock')} icon={Lock}>
                    {t('adminDomains.accounts.lock')}
                  </ActionLink>
                  <ActionLink to={adminUserHubLink('/app/admin/accounts/password', userId, 'reset')} icon={Mail}>
                    {t('adminDomains.accounts.resetPassword')}
                  </ActionLink>
                  <ActionLink to={adminUserHubLink('/app/admin/accounts/password', userId, 'force')} icon={KeyRound}>
                    {t('adminDomains.accounts.forcePassword')}
                  </ActionLink>
                  <ActionLink to={adminUserHubLink('/app/admin/accounts/password', userId, 'set')} icon={KeyRound}>
                    {t('adminDomains.accounts.setPassword')}
                  </ActionLink>
                  {summary?.pendingActivation ? (
                    <ActionLink to={adminUserHubLink('/app/admin/accounts/access', userId, 'activate')} icon={ShieldCheck}>
                      {t('adminDomains.accounts.activate')}
                    </ActionLink>
                  ) : null}
                  <ActionLink to={adminUserHubLink('/app/admin/accounts/access', userId, 'revoke')} icon={LogOut}>
                    {t('adminDomains.accounts.revokeSessions')}
                  </ActionLink>
                  <ActionLink
                    to={adminUserHubLink('/app/admin/accounts/verification', userId, 'resend')}
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
                <Link
                  to={adminUserHubLink('/app/admin/users/people-ops', userId, 'edit')}
                  className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
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
