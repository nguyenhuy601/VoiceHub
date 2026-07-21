import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function ResponsibilityAssignPanel({ orgId }) {
  const { t } = useAppStrings();
  const [userId, setUserId] = useState('');
  const [keysText, setKeysText] = useState('backend');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState([]);

  const loadUser = async () => {
    if (!orgId || !userId.trim()) return;
    try {
      const res = await organizationAPI.getUserResponsibilities(orgId, userId.trim());
      const data = res?.data?.data ?? res?.data ?? res;
      setCurrent(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length) {
        setKeysText(data.map((r) => r.responsibilityKey).join(', '));
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityLoadFail') }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || !userId.trim()) return;
    const keys = keysText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await organizationAPI.setUserResponsibilities(orgId, userId.trim(), keys);
      toast.success(t('adminRbac.responsibilityAssignDone'));
      await loadUser();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityAssignFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.responsibilityAssign')}
      hint={t('adminRbac.responsibilityAssignHint')}
    >
      <AdminUserFormCard title={t('adminDomains.rbac.responsibilityAssign')}>
        <form className="space-y-3" onSubmit={submit}>
          <label className={adminLabelClass()}>
            {t('adminRbac.responsibilityUserId')}
            <div className="flex flex-wrap gap-2">
              <input
                className={adminInputClass()}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="ObjectId"
              />
              <button type="button" className={adminPrimaryBtnClass()} onClick={loadUser}>
                Load
              </button>
            </div>
          </label>
          <label className={adminLabelClass()}>
            {t('adminRbac.responsibilityKeys')}
            <input
              className={adminInputClass()}
              value={keysText}
              onChange={(e) => setKeysText(e.target.value)}
              placeholder="backend, frontend"
            />
          </label>
          <button type="submit" className={adminPrimaryBtnClass()} disabled={busy}>
            {t('adminRbac.responsibilityAssignSubmit')}
          </button>
          {current.length ? (
            <p className="text-xs text-muted-foreground">
              {current.map((r) => r.responsibilityKey).join(', ')}
            </p>
          ) : null}
        </form>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
