/** Huy: Tạo nhóm — parent theo schema (department / division / root). */
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
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function TeamCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { departments, divisions, loadStructure } = useAdminOrgStructure(orgId);
  const { ready, createParents } = useOrgStructureLevels(orgId);
  const teamParent = createParents.teamParent;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', parentId: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || saving || !ready) return;
    const name = String(form.name || '').trim();
    const parentId = String(form.parentId || '').trim();
    if (!name || (teamParent && !parentId)) {
      toast.error(t('adminOrg.teamCreateValidation'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        description: String(form.description || '').trim(),
      };
      if (teamParent === 'department') {
        await organizationAPI.createTeamByDepartment(orgId, parentId, payload);
      } else if (teamParent === 'division') {
        await organizationAPI.createTeamByDivision(orgId, parentId, payload);
      } else {
        await organizationAPI.createTeamRoot(orgId, payload);
      }
      toast.success(t('adminOrg.created'));
      setForm({ name: '', description: '', parentId: '' });
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  const hint = !ready
    ? t('common.loading')
    : teamParent === 'department'
      ? t('adminOrg.teamCreateHint')
      : teamParent === 'division'
        ? t('adminOrg.teamCreateHintDivision')
        : t('adminOrg.teamCreateHintRoot');

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.teamCreate')} hint={hint}>
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
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.description')}</span>
            <textarea
              rows={3}
              disabled={!ready}
              className={adminInputClass()}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('adminOrg.description')}
            />
          </label>
          {ready && teamParent === 'department' ? (
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.colDepartment')}</span>
              <select
                required
                className={adminInputClass()}
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">{t('adminOrg.selectDepartment')}</option>
                {departments.map((d) => (
                  <option key={unitId(d)} value={unitId(d)}>
                    {unitName(d)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {ready && teamParent === 'division' ? (
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.colDivision')}</span>
              <select
                required
                className={adminInputClass()}
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">{t('adminOrg.selectDivision')}</option>
                {divisions.map((d) => (
                  <option key={unitId(d)} value={unitId(d)}>
                    {unitName(d)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit" disabled={saving || !ready} className={adminPrimaryBtnClass()}>
            {saving ? t('common.saving') : t('adminDomains.orgStructure.teamCreate')}
          </button>
        </form>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
