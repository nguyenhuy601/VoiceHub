/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
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
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function BranchCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { loadStructure } = useAdminOrgStructure(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateBranch = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.BRANCH_CREATE);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', location: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    if (!canCreateBranch) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    const name = String(form.name || '').trim();
    if (!name) {
      toast.error(t('adminOrg.branchCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createBranch(orgId, {
        name,
        location: String(form.location || '').trim(),
      });
      toast.success(t('adminOrg.created'));
      setForm({ name: '', location: '' });
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchCreate')}
      hint={t('adminOrg.branchCreateHint')}
    >
      {!canCreateBranch ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.grantDenied')}</p>
      ) : (
      <AdminUserFormCard>
        <form className="mx-auto max-w-lg space-y-4" onSubmit={submit}>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
            <input
              required
              className={adminInputClass()}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('adminOrg.name')}
            />
          </label>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.location')}</span>
            <input
              className={adminInputClass()}
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder={t('adminOrg.location')}
            />
          </label>
          <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('adminDomains.orgStructure.branchCreate')}
          </button>
        </form>
      </AdminUserFormCard>
      )}
    </AdminUserPanelShell>
  );
}
