/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
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
import { unitId } from '../../utils/adminOrgStructureUtils';

export default function BranchEditPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { branches, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId, { includeInactive: embedded });
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canUpdateBranch = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.BRANCH_UPDATE);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', location: '' });

  const selected = useMemo(
    () => branches.find((row) => unitId(row) === selectedId) || null,
    [branches, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    if (!selected) {
      setForm({ name: '', location: '' });
      return;
    }
    setForm({
      name: selected.name || '',
      location: selected.location || '',
    });
  }, [selected]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !selectedId || saving) return;
    if (!canUpdateBranch) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.updateBranch(orgId, selectedId, {
        name: String(form.name || '').trim(),
        location: String(form.location || '').trim(),
      });
      toast.success(t('adminOrg.saved'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.orgStructure.branchEdit')}>
      {structureError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {structureError}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadStructure()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
      ) : (
        <form className="space-y-4" onSubmit={save}>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
            <input
              required
              className={adminInputClass()}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.location')}</span>
            <input
              className={adminInputClass()}
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </form>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchEdit')}
      hint={t('adminOrg.branchEditHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={branches}
          loading={loading}
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.branchEditPickerHint')}
          subtitleFn={(row) => row.location || ''}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
