import { useEffect, useState } from 'react';
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
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberUserId, unwrapApi } from '../../utils/adminUserUtils';

export default function AccountLockPanel({ orgId }) {
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
    <AdminUserPanelShell title={t('adminDomains.accounts.lock')} hint={t('adminUsers.lockHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.lockPickerHint')} />
        <AdminUserFormCard title={t('adminDomains.accounts.lock')} hint={t('adminUsers.lockHint')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : summary ? (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('adminUsers.currentStatus')}:</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                  isLocked
                    ? 'bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-200'
                    : 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
                }`}
              >
                {isLocked ? t('adminUsers.statusInactive') : t('adminUsers.statusActive')}
              </span>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!userId || busy || isLocked}
              className={adminDangerBtnClass()}
              onClick={() => toggleLock(true)}
            >
              <Lock className="h-3.5 w-3.5" />
              {t('adminUsers.lockAccount')}
            </button>
            <button
              type="button"
              disabled={!userId || busy || !isLocked}
              className={adminSecondaryBtnClass()}
              onClick={() => toggleLock(false)}
            >
              <Unlock className="h-3.5 w-3.5" />
              {t('adminUsers.unlockAccount')}
            </button>
          </div>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
