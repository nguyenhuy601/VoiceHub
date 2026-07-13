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

export default function TeamCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, loadStructure } = useAdminOrgStructure(orgId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', departmentId: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const name = String(form.name || '').trim();
    const departmentId = String(form.departmentId || '').trim();
    if (!name || !departmentId) {
      toast.error(t('adminOrg.teamCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.createTeamByDepartment(orgId, departmentId, {
        name,
        description: String(form.description || '').trim(),
      });
      toast.success(t('adminOrg.created'));
      setForm({ name: '', description: '', departmentId: '' });
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.teamCreate')} hint={t('adminOrg.teamCreateHint')}>
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
            <span className={adminLabelClass()}>{t('adminOrg.colDepartment')}</span>
            <select
              required
              className={adminInputClass()}
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
            >
              <option value="">{t('adminOrg.selectDepartment')}</option>
              {departments.map((d) => (
                <option key={unitId(d)} value={unitId(d)}>
                  {unitName(d)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('adminDomains.orgStructure.teamCreate')}
          </button>
        </form>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
