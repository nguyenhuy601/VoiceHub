import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, GradientButton } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { enrichMembershipsWithProfiles } from '../../features/search/enrichOrgMembers';

const unwrap = (payload) => payload?.data ?? payload;

export default function PeoplePanel({ orgId }) {
  const { t } = useAppStrings();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'member',
  });
  const [lastInviteEmail, setLastInviteEmail] = useState('');

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getMembersWithRoles(orgId);
      const data = unwrap(res);
      const list = data?.data?.members || data?.members || data;
      const raw = Array.isArray(list) ? list : [];
      const enriched = await enrichMembershipsWithProfiles(raw, {
        fallback: t('organizations.memberFallbackShort'),
        limit: 120,
      });
      setMembers(enriched);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
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
      setLastInviteEmail(email);
      toast.success(t('companyAdmin.inviteEmailSent'));
      setModalOpen(false);
      setForm({ email: '', firstName: '', lastName: '', role: 'member' });
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.inviteFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('companyAdmin.tabPeople')}</h2>
        <GradientButton type="button" onClick={() => setModalOpen(true)}>
          {t('companyAdmin.addEmployee')}
        </GradientButton>
      </div>
      {lastInviteEmail ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          {t('companyAdmin.inviteEmailSentTo', { email: lastInviteEmail })}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('companyAdmin.colName')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colEmail')}</th>
                <th className="px-3 py-2">{t('companyAdmin.colRole')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const id = String(m.userId || m.membershipId || '');
                return (
                  <tr key={id || m.displayName} className="border-t border-border/60">
                    <td className="px-3 py-2">{m.displayName || '—'}</td>
                    <td className="px-3 py-2">{m.email || '—'}</td>
                    <td className="px-3 py-2">{m.role || 'member'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('companyAdmin.addEmployee')}>
        <form className="space-y-3" onSubmit={handleInvite}>
          <p className="text-sm text-muted-foreground">{t('companyAdmin.inviteEmailHint')}</p>
          <input
            type="email"
            required
            autoComplete="email"
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
      </Modal>
    </div>
  );
}
