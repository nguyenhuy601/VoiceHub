import { useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import useAdminMembers from '../../hooks/useAdminMembers';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

export default function UserCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { refreshStats } = useCompanyAdminContext();
  const { loadMembers } = useAdminMembers(orgId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'member',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const email = String(form.email || '').trim();
    if (!email) {
      toast.error(t('companyAdmin.emailRequired'));
      return;
    }
    setSaving(true);
    try {
      await organizationAPI.inviteMemberByEmail(orgId, {
        email,
        firstName: String(form.firstName || '').trim(),
        lastName: String(form.lastName || '').trim(),
        role: form.role,
      });
      toast.success(t('companyAdmin.inviteEmailSentTo', { email }));
      setForm({ email: '', firstName: '', lastName: '', role: 'member' });
      await loadMembers();
      refreshStats?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.inviteFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.create')} hint={t('adminUsers.createHint')}>
      <AdminUserFormCard>
        <form className="mx-auto max-w-lg space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className={adminLabelClass()}>{t('companyAdmin.emailPlaceholder')}</span>
            <input
              type="email"
              required
              className={adminInputClass()}
              placeholder={t('companyAdmin.emailPlaceholder')}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={adminLabelClass()}>{t('companyAdmin.firstName')}</span>
              <input
                className={adminInputClass()}
                placeholder={t('companyAdmin.firstName')}
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('companyAdmin.lastName')}</span>
              <input
                className={adminInputClass()}
                placeholder={t('companyAdmin.lastName')}
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminUsers.membershipRole')}</span>
            <select
              className={adminInputClass()}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="member">member</option>
              <option value="hr">hr</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button type="submit" disabled={saving} className={adminPrimaryBtnClass('w-full sm:w-auto')}>
            {saving ? t('common.saving') : t('companyAdmin.sendInvite')}
          </button>
        </form>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
