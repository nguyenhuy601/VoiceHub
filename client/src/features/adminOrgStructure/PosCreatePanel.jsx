/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useState } from 'react';
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
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function PosCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { loadMembers } = useAdminMembers(orgId);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const jobTitle = String(title || '').trim();
    if (!jobTitle) {
      toast.error(t('adminOrg.posCreateValidation'));
      return;
    }
    if (!userId) {
      toast.error(t('adminOrg.posCreateNeedUser'));
      return;
    }
    setSaving(true);
    try {
      await adminUserAPI.patchProfile(orgId, userId, { jobTitle });
      toast.success(t('adminOrg.posCreated'));
      setTitle('');
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posCreateFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.posCreate')} hint={t('adminOrg.posCreateHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.posCreateUserHint')} />
        <AdminUserFormCard title={t('adminDomains.orgStructure.posCreate')} hint={t('adminOrg.posAssignOptional')}>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
              <input
                required
                className={adminInputClass()}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('adminOrg.posTitle')}
              />
            </label>
            <button type="submit" disabled={saving || !userId} className={adminPrimaryBtnClass()}>
              {saving ? t('common.saving') : t('adminDomains.orgStructure.posCreate')}
            </button>
          </form>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
