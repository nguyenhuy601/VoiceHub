import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberUserId, unwrapApi } from '../../utils/adminUserUtils';

export default function UserLockPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { members, loadMembers } = useAdminMembers(orgId);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const memberRow = members.find((m) => memberUserId(m) === userId);

  useEffect(() => {
    if (!orgId || !userId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminUserAPI.getAuthSummary(orgId, userId);
        if (!cancelled) setSummary(unwrapApi(res)?.data ?? unwrapApi(res));
      } catch {
        if (!cancelled && memberRow) {
          setSummary({
            isActive: memberRow.isActive !== false,
            mustChangePassword: Boolean(memberRow.mustChangePassword),
            isLocked: Boolean(memberRow.isLocked),
          });
        } else if (!cancelled) {
          setSummary(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, memberRow]);

  const toggleLock = async (locked) => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.setLocked(orgId, userId, locked);
      setSummary(unwrapApi(res)?.data ?? unwrapApi(res));
      toast.success(locked ? t('adminUsers.locked') : t('adminUsers.unlocked'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.lockFail') }));
    } finally {
      setBusy(false);
    }
  };

  const isLocked = summary?.isActive === false;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.lockPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.lock')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.lockHint')}</p>
        {userId && summary ? (
          <p className="mt-3 text-sm">
            {t('adminUsers.currentStatus')}:{' '}
            <span className="font-medium">{isLocked ? t('adminUsers.statusInactive') : t('adminUsers.statusActive')}</span>
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <GradientButton type="button" disabled={!userId || busy || isLocked} onClick={() => toggleLock(true)}>
            {t('adminUsers.lockAccount')}
          </GradientButton>
          <GradientButton type="button" variant="secondary" disabled={!userId || busy || !isLocked} onClick={() => toggleLock(false)}>
            {t('adminUsers.unlockAccount')}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}
