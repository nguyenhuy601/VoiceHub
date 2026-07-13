import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

export default function UserEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', jobTitle: '' });

  useEffect(() => {
    if (!orgId || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminUserAPI.getProfile(orgId, userId);
        const data = unwrapApi(res)?.data ?? unwrapApi(res);
        if (cancelled) return;
        setForm({
          displayName: data?.displayName || '',
          jobTitle: data?.jobTitle || data?.preferences?.jobTitle || '',
        });
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.loadProfileFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || saving) return;
    setSaving(true);
    try {
      await adminUserAPI.patchProfile(orgId, userId, {
        displayName: String(form.displayName || '').trim(),
        jobTitle: String(form.jobTitle || '').trim(),
      });
      toast.success(t('adminUsers.profileSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.profileSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.edit')} hint={t('adminUsers.editPickerHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.editPickerHint')} />
        <AdminUserFormCard title={t('adminUsers.editInfo')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.displayName')}</span>
                <input
                  className={adminInputClass()}
                  placeholder={t('adminUsers.displayName')}
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.jobTitle')}</span>
                <input
                  className={adminInputClass()}
                  placeholder={t('adminUsers.jobTitle')}
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </label>
              <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </form>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
