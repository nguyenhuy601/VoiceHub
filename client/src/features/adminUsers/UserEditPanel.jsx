import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.editPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.edit')}</h2>
        {!userId ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : loading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={save}>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder={t('adminUsers.displayName')}
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder={t('adminUsers.jobTitle')}
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
            <GradientButton type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </GradientButton>
          </form>
        )}
      </div>
    </div>
  );
}
