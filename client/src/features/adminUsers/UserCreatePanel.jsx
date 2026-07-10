import { useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import useAdminMembers from '../../hooks/useAdminMembers';

export default function UserCreatePanel({ orgId }) {
  const { t } = useAppStrings();
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
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.inviteFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.users.create')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminUsers.createHint')}</p>
      </div>
      <form className="space-y-3 rounded-xl border border-border bg-card/40 p-4" onSubmit={handleSubmit}>
        <input
          type="email"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder={t('companyAdmin.emailPlaceholder')}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('companyAdmin.firstName')}
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
          <input
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('companyAdmin.lastName')}
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        >
          <option value="member">member</option>
          <option value="hr">hr</option>
          <option value="admin">admin</option>
        </select>
        <GradientButton type="submit" disabled={saving}>
          {saving ? t('common.saving') : t('companyAdmin.sendInvite')}
        </GradientButton>
      </form>
    </div>
  );
}
