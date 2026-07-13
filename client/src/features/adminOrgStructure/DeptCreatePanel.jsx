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
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function DeptCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { divisions, loadStructure } = useAdminOrgStructure(orgId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', divisionId: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const name = String(form.name || '').trim();
    const divisionId = String(form.divisionId || '').trim();
    if (!name || !divisionId) {
      toast.error(t('adminOrg.deptCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createDepartmentByDivision(orgId, divisionId, {
        name,
        description: String(form.description || '').trim(),
      });
      toast.success(t('adminOrg.created'));
      setForm({ name: '', description: '', divisionId: '' });
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.deptCreate')} hint={t('adminOrg.deptCreateHint')}>
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
            <span className={adminLabelClass()}>{t('adminOrg.description')}</span>
            <textarea
              rows={3}
              className={adminInputClass()}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('adminOrg.description')}
            />
          </label>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.colDivision')}</span>
            <select
              required
              className={adminInputClass()}
              value={form.divisionId}
              onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value }))}
            >
              <option value="">{t('adminOrg.selectDivision')}</option>
              {divisions.map((d) => (
                <option key={unitId(d)} value={unitId(d)}>
                  {unitName(d)}
                  {d.branchName ? ` · ${d.branchName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('adminDomains.orgStructure.deptCreate')}
          </button>
        </form>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
