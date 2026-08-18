import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberOrgRole, memberUserId, unwrapApi } from '../../utils/adminUserUtils';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS } from '../../utils/roleTaxonomy';
import { unwrapOrgList } from '../../utils/userTaxonomyUtils';
import useAdminMembers from '../../hooks/useAdminMembers';

const MEMBERSHIP_ROLE_OPTIONS = ['member', 'hr', 'admin', 'owner'];

function normalizeMembershipRole(raw) {
  const role = String(raw || 'member').trim().toLowerCase();
  return MEMBERSHIP_ROLE_OPTIONS.includes(role) ? role : 'member';
}

function unwrapMaster(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/** Enabled Position catalog (cùng nguồn PosList / listHrPositions) → { key, label }. */
function buildPositionOptionsFromHr(positions) {
  const list = Array.isArray(positions) ? positions : [];
  if (!list.length) {
    return DEFAULT_HR_ROLE_KEYS.map((key) => ({
      key,
      label: DEFAULT_HR_ROLE_LABELS[key] || key,
    }));
  }
  return list
    .map((p) => ({
      key: String(p.key || p.title || '').trim(),
      label: String(p.title || p.label || p.key || '').trim(),
    }))
    .filter((p) => p.key)
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

export default function UserEditPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadTick, setLoadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [initialRole, setInitialRole] = useState('member');
  const [positionOptions, setPositionOptions] = useState(() =>
    DEFAULT_HR_ROLE_KEYS.map((key) => ({
      key,
      label: DEFAULT_HR_ROLE_LABELS[key] || key,
    }))
  );
  const [form, setForm] = useState({
    displayName: '',
    jobTitle: '',
    role: 'member',
  });
  const { loadMembers } = useAdminMembers(orgId);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.listHrPositions(orgId);
        if (cancelled) return;
        const data = unwrapMaster(res);
        setPositionOptions(buildPositionOptionsFromHr(data?.positions));
      } catch {
        /* fallback DEFAULT_HR already set */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
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
          const msg = resolveApiErrorMessage(error, { t, fallback: t('adminUsers.loadProfileFail') });
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, loadTick]);

  const selectOptions = useMemo(() => {
    const current = String(form.jobTitle || '').trim();
    if (!current) return positionOptions;
    const hit = positionOptions.some(
      (p) => p.label === current || p.key === current.toLowerCase().replace(/\s+/g, '_')
    );
    if (hit) return positionOptions;
    return [{ key: '_legacy', label: current }, ...positionOptions];
  }, [form.jobTitle, positionOptions]);

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
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.profileSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminUsers.editInfo')}>
      {!userId ? (
        <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={saving}
            onClick={() => setLoadTick((n) => n + 1)}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
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
            <select
              className={adminInputClass()}
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            >
              <option value="">{t('adminUsers.jobTitleSelectPlaceholder')}</option>
              {selectOptions.map((opt) => (
                <option key={opt.key} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('adminUsers.jobTitleSelectHint')}</p>
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
    <AdminUserPanelShell title={t('adminDomains.users.edit')} hint={t('adminUsers.editPickerHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.editPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
