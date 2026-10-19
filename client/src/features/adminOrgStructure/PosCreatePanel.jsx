/** Tạo OrganizationalPosition trong catalog — chưa gán nhân sự. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner } from '../../components/adminUsers/adminPanelStates';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const POS_LIST_PATH = '/app/admin/rbac/positions';

export default function PosCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { can, assertOrToast } = useAdminActionGate(orgId);
  const canCreate = can(RBAC_GRANT.POSITION_CREATE);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    if (!canCreate) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    const title = String(name || '').trim();
    if (!title) {
      toast.error(t('adminOrg.posCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createHrPosition(orgId, {
        title,
        description: String(description || '').trim(),
      });
      toast.success(t('adminOrg.posCreated'));
      navigate(POS_LIST_PATH);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posCreateFail') }));
    } finally {
      setSaving(false);
    }
  };

  if (!orgId) {
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.posCreate')} hint={t('adminOrg.posCreateHint')}>
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectOrgHint')}</p>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posCreate')} hint={t('adminOrg.posCreateHint')}>
      {!canCreate ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.grantDenied')}</p>
      ) : (
        <AdminUserFormCard>
          <form className="mx-auto max-w-lg space-y-4" onSubmit={submit}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
              <input
                maxLength={120}
                required
                className={adminInputClass()}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('adminOrg.posTitlePlaceholder')}
              />
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.description')}</span>
              <textarea
                maxLength={800}
                rows={4}
                className={adminInputClass()}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                aria-busy={saving || undefined}
                className={adminPrimaryBtnClass()}
              >
                <AdminBusySpinner busy={saving} />
                {saving ? t('common.saving') : t('adminDomains.rbac.posCreate')}
              </button>
              <button
                type="button"
                disabled={saving}
                className={adminSecondaryBtnClass()}
                onClick={() => navigate(POS_LIST_PATH)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </AdminUserFormCard>
      )}
    </AdminUserPanelShell>
  );
}
