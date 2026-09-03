/** Huy: Domain Cơ cấu tổ chức — admin Khối (division); parent chi nhánh chỉ khi schema có branch. */
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
import useOrgStructureLevels from '../../hooks/useOrgStructureLevels';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function DivisionCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { branches, loadStructure } = useAdminOrgStructure(orgId);
  const { ready, createParents } = useOrgStructureLevels(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateDivision = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DIVISION_CREATE);
  const requireBranch = createParents.divisionParent === 'branch';
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', branchId: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving || !ready) return;
    if (!canCreateDivision) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    const name = String(form.name || '').trim();
    const branchId = String(form.branchId || '').trim();
    if (!name || (requireBranch && !branchId)) {
      toast.error(t(requireBranch ? 'adminOrg.divisionCreateValidation' : 'adminOrg.divisionCreateValidationRoot'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createDivision(orgId, requireBranch ? branchId : null, { name });
      toast.success(t('adminOrg.created'));
      setForm({ name: '', branchId: '' });
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.divisionCreate')}
      hint={
        !ready
          ? t('common.loading')
          : requireBranch
            ? t('adminOrg.divisionCreateHint')
            : t('adminOrg.divisionCreateHintRoot')
      }
    >
      {!canCreateDivision ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.grantDenied')}</p>
      ) : (
      <AdminUserFormCard>
        <form className="mx-auto max-w-lg space-y-4" onSubmit={submit}>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
            <input
              required
              disabled={!ready}
              className={adminInputClass()}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('adminOrg.name')}
            />
          </label>
          {ready && requireBranch ? (
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.colBranch')}</span>
              <select
                required
                className={adminInputClass()}
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                <option value="">{t('adminOrg.selectBranch')}</option>
                {branches
                  .filter((b) => b.isActive !== false)
                  .map((b) => (
                    <option key={unitId(b)} value={unitId(b)}>
                      {unitName(b)}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <button type="submit" disabled={saving || !ready} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('adminDomains.orgStructure.divisionCreate')}
          </button>
        </form>
      </AdminUserFormCard>
      )}
    </AdminUserPanelShell>
  );
}
