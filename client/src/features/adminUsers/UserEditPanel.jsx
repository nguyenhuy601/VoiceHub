import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberOrgRole, memberUserId, unwrapApi } from '../../utils/adminUserUtils';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS } from '../../utils/roleTaxonomy';
import { unwrapOrgList } from '../../utils/userTaxonomyUtils';

const MEMBERSHIP_ROLE_OPTIONS = ['member', 'hr', 'admin', 'owner'];

function normalizeMembershipRole(raw) {
  const role = String(raw || 'member').trim().toLowerCase();
  return MEMBERSHIP_ROLE_OPTIONS.includes(role) ? role : 'member';
}

export default function UserEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialRole, setInitialRole] = useState('member');
  const [form, setForm] = useState({
    displayName: '',
    jobTitle: '',
    role: 'member',
  });

  useEffect(() => {
    if (!orgId || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [profileRes, membersRes] = await Promise.all([
          adminUserAPI.getProfile(orgId, userId),
          organizationAPI.getMembers(orgId),
        ]);
        const data = unwrapApi(profileRes)?.data ?? unwrapApi(profileRes);
        const members = unwrapOrgList(membersRes);
        const membership = members.find((m) => memberUserId(m) === userId);
        const role = normalizeMembershipRole(memberOrgRole(membership));
        if (cancelled) return;
        setInitialRole(role);
        setForm({
          displayName: data?.displayName || '',
          jobTitle: data?.jobTitle || data?.preferences?.jobTitle || '',
          role,
        });
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.loadProfileFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || saving) return;
    setSaving(true);
    try {
      const nextRole = normalizeMembershipRole(form.role);
      await adminUserAPI.patchProfile(orgId, userId, {
        displayName: String(form.displayName || '').trim(),
        jobTitle: String(form.jobTitle || '').trim(),
      });
      if (nextRole !== initialRole) {
        await organizationAPI.updateMemberRole(orgId, userId, nextRole);
        setInitialRole(nextRole);
      }
      toast.success(t('adminUsers.profileSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.profileSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.edit')} hint={t('adminUsers.editPickerHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.editPickerHint')} />
        <AdminUserFormCard title={t('adminUsers.editInfo')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.displayName')}</span>
                <input
                  className={adminInputClass()}
                  placeholder={t('adminUsers.displayName')}
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.membershipRole')}</span>
                <select
                  className={adminInputClass()}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {MEMBERSHIP_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.jobTitle')}</span>
                <input
                  className={adminInputClass()}
                  placeholder={t('adminUsers.jobTitle')}
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </label>
              <div>
                <p className={adminLabelClass()}>{t('adminUsers.jobTitleSuggestions')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEFAULT_HR_ROLE_KEYS.map((key) => {
                    const label = DEFAULT_HR_ROLE_LABELS[key] || key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                        onClick={() => setForm((f) => ({ ...f, jobTitle: label }))}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </form>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
