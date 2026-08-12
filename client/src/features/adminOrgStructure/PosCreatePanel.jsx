/** Position (HR) — admin RBAC */
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
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isConfusingPositionTitle } from '../../utils/roleLayerNaming';

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
    if (isConfusingPositionTitle(jobTitle)) {
      toast.error(t('adminOrg.posTitleConfusingError'));
      return;
    }
    setSaving(true);
    try {
      if (userId) {
        await adminUserAPI.patchProfile(orgId, userId, { jobTitle });
        await loadMembers();
      } else {
        await organizationAPI.createHrPosition(orgId, { title: jobTitle });
      }
      toast.success(t('adminOrg.posCreated'));
      setTitle('');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posCreateFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posCreate')} hint={t('adminOrg.posCreateHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectedUserId={userId}
          hint={t('adminOrg.posCreateUserHintOptional')}
        />
        <AdminUserFormCard title={t('adminDomains.rbac.posCreate')} hint={t('adminOrg.posAssignOptional')}>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
              <input
                required
                className={adminInputClass()}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('adminOrg.posTitlePlaceholder')}
              />
              {title.trim() && isConfusingPositionTitle(title) ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminOrg.posTitleConfusingError')}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">{t('adminOrg.posTitleHint')}</p>
            </label>
            <button type="submit" disabled={saving || !title.trim()} className={adminPrimaryBtnClass()}>
              {saving ? t('common.saving') : t('adminDomains.rbac.posCreate')}
            </button>
          </form>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
