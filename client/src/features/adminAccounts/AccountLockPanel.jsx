import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock, Unlock } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  AccountLoadError,
  AccountStatusPill,
  unwrapSummary,
  useAccountAuthSummary,
} from './accountPanelParts';

export default function AccountLockPanel({ orgId, embedded = false }) {
  const { t, locale } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { loadMembers } = useAdminMembers(orgId, { view: 'directory' });
  const { summary, setSummary, loading, loadError, reload } = useAccountAuthSummary(
    orgId,
    userId,
    'adminUsers.lockFail'
  );
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggleLock = async (locked) => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.setLocked(orgId, userId, locked === true);
      const next = unwrapSummary(res);
      if (next && typeof next === 'object') setSummary(next);
      toast.success(locked ? t('adminUsers.locked') : t('adminUsers.unlocked'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.lockFail') }));
    } finally {
      setBusy(false);
    }
  };

  const lockUntil = summary?.lockUntil ? new Date(summary.lockUntil) : null;
  const isRateLocked = Boolean(lockUntil && lockUntil > new Date());
  const isAdminLocked = summary?.isActive === false && !summary?.pendingActivation;
  const isLocked = isAdminLocked || isRateLocked;

  let statusPill = <AccountStatusPill tone="success">{t('adminUsers.statusActive')}</AccountStatusPill>;
  if (summary?.pendingActivation) {
    statusPill = <AccountStatusPill tone="warning">{t('adminAccounts.statusPendingActivation')}</AccountStatusPill>;
  } else if (isAdminLocked) {
    statusPill = <AccountStatusPill tone="danger">{t('adminAccounts.lockedByAdmin')}</AccountStatusPill>;
  } else if (isRateLocked) {
    statusPill = (
      <AccountStatusPill tone="warning">
        {t('adminAccounts.rateLockedUntil', {
          time: lockUntil.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        })}
      </AccountStatusPill>
    );
  }

  const actionsDisabled = !userId || busy || loading || Boolean(loadError) || !summary;

  const body = (
    <>
      <AdminUserFormCard title={t('adminDomains.accounts.lock')} hint={t('adminUsers.lockHint')}>
        {!userId ? (
          <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : loading ? (
          <p className="mb-4 text-sm text-muted-foreground" aria-busy="true">
            {t('common.loading')}
          </p>
        ) : loadError ? (
          <AccountLoadError message={loadError} onRetry={reload} disabled={busy} />
        ) : summary ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('adminUsers.currentStatus')}:</span>
            {statusPill}
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">{t('adminAccounts.summaryUnavailable')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={actionsDisabled || isAdminLocked}
            className={adminDangerBtnClass()}
            onClick={() => setConfirmOpen(true)}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {busy ? t('common.saving') : t('adminUsers.lockAccount')}
          </button>
          <button
            type="button"
            disabled={actionsDisabled || !isLocked}
            className={adminSecondaryBtnClass()}
            onClick={() => toggleLock(false)}
          >
            <Unlock className="h-3.5 w-3.5" aria-hidden />
            {busy ? t('common.saving') : t('adminUsers.unlockAccount')}
          </button>
        </div>
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toggleLock(true)}
        title={t('adminAccounts.lockConfirmTitle')}
        message={t('adminAccounts.lockConfirmMessage')}
        confirmText={t('adminUsers.lockAccount')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.lock')} hint={t('adminUsers.lockHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.lockPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
