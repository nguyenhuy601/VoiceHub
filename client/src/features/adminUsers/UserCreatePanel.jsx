import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApiData } from '../../utils/helpers';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { DEFAULT_HR_ROLE_KEYS, DEFAULT_HR_ROLE_LABELS } from '../../utils/roleTaxonomy';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

/** Catalog chức danh HR gợi ý khi mời (Position SoT — không phải Project Role). */
const EXTRA_JOB_TITLE_OPTIONS = [
  'Backend Developer',
  'Frontend Developer',
  'Fullstack Developer',
  'Mobile Developer',
  'QA Engineer',
  'Business Analyst',
  'Project Manager',
  'Product Designer',
  'DevOps Engineer',
  'Data Analyst',
  'Tech Lead',
];

const JOB_TITLE_CUSTOM = '__custom__';

function unitId(row) {
  return String(row?._id || row?.id || '').trim();
}

function buildJobTitleOptions(memberTitles = []) {
  const set = new Set();
  for (const key of DEFAULT_HR_ROLE_KEYS) {
    const label = DEFAULT_HR_ROLE_LABELS[key] || key;
    if (label) set.add(label);
  }
  for (const title of EXTRA_JOB_TITLE_OPTIONS) set.add(title);
  for (const title of memberTitles) {
    const raw = String(title || '').trim();
    if (raw) set.add(raw);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

export default function UserCreatePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const { refreshStats } = useCompanyAdminContext();
  const { loadMembers, members } = useAdminMembers(orgId);
  const { departments, loading: depsLoading } = useAdminOrgStructure(orgId);
  const [saving, setSaving] = useState(false);
  const [manualInviteUrl, setManualInviteUrl] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [jobTitleSelect, setJobTitleSelect] = useState('');
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'member',
    departmentId: '',
    jobTitle: '',
  });

  const jobTitleOptions = useMemo(() => {
    const fromMembers = (members || [])
      .map((m) => m?.jobTitle || m?.preferences?.jobTitle)
      .filter(Boolean);
    return buildJobTitleOptions(fromMembers);
  }, [members]);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.previewNextEmployeeCode(orgId);
        const data = unwrapApiData(res) || res?.data || res;
        const code = String(data?.employeeCode || data?.data?.employeeCode || '').trim();
        if (!cancelled) setPreviewCode(code);
      } catch {
        if (!cancelled) setPreviewCode('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const email = String(form.email || '').trim();
    if (!email) {
      toast.error(t('companyAdmin.emailRequired'));
      return;
    }
    if (!String(form.departmentId || '').trim()) {
      toast.error(t('adminUsers.inviteDepartmentRequired'));
      return;
    }
    if (!String(form.jobTitle || '').trim()) {
      toast.error(t('adminUsers.inviteJobTitleRequired'));
      return;
    }
    setSaving(true);
    setManualInviteUrl('');
    try {
      const res = await organizationAPI.inviteMemberByEmail(orgId, {
        email,
        firstName: String(form.firstName || '').trim(),
        lastName: String(form.lastName || '').trim(),
        role: form.role || 'member',
        departmentId: String(form.departmentId || '').trim(),
        jobTitle: String(form.jobTitle || '').trim(),
      });
      const body = unwrapApiData(res) || res?.data || res;
      const data = body?.data || body;
      const inviteUrl = String(data?.inviteUrl || '').trim();
      const emailSent = data?.emailSent !== false;
      const assignedCode = String(data?.employeeCode || '').trim();

      if (emailSent) {
        toast.success(
          assignedCode
            ? t('adminUsers.inviteSentWithCode', { email, code: assignedCode })
            : t('companyAdmin.inviteEmailSentTo', { email })
        );
      } else {
        toast.error(data?.emailError || t('adminUsers.inviteEmailFailedKeepLink'), {
          duration: 6000,
        });
        if (inviteUrl) setManualInviteUrl(inviteUrl);
      }
      setForm({
        email: '',
        firstName: '',
        lastName: '',
        role: 'member',
        departmentId: '',
        jobTitle: '',
      });
      setJobTitleSelect('');
      if (assignedCode) setPreviewCode('');
      try {
        const peek = await organizationAPI.previewNextEmployeeCode(orgId);
        const peekData = unwrapApiData(peek) || peek?.data || peek;
        setPreviewCode(String(peekData?.employeeCode || peekData?.data?.employeeCode || '').trim());
      } catch {
        /* ignore */
      }
      await loadMembers();
      refreshStats?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.inviteFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard>
      <p className="mb-3 text-sm text-muted-foreground">{t('adminUsers.inviteFormHint')}</p>
      <form className="mx-auto max-w-lg space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className={adminLabelClass()}>{t('adminUsers.employeeCodeAuto')}</span>
          <input
            type="text"
            readOnly
            className={`${adminInputClass()} bg-muted/40 font-mono`}
            value={previewCode || t('adminUsers.employeeCodeLoading')}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('adminUsers.employeeCodeAutoHint')}</p>
        </label>

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
          <span className={adminLabelClass()}>{t('adminUsers.inviteDepartment')}</span>
          <select
            required
            className={adminInputClass()}
            value={form.departmentId}
            disabled={depsLoading || !departments.length}
            onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
          >
            <option value="">{t('adminUsers.inviteDepartmentPlaceholder')}</option>
            {departments.map((d) => (
              <option key={unitId(d)} value={unitId(d)}>
                {d.name || unitId(d)}
              </option>
            ))}
          </select>
          {!depsLoading && !departments.length ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('adminUsers.inviteNoDepartments')}</p>
          ) : null}
        </label>

        <div className="space-y-2">
          <label className="block">
            <span className={adminLabelClass()}>{t('adminUsers.inviteJobTitle')}</span>
            <select
              required={jobTitleSelect !== JOB_TITLE_CUSTOM}
              className={adminInputClass()}
              value={jobTitleSelect}
              onChange={(e) => {
                const v = e.target.value;
                setJobTitleSelect(v);
                if (v === JOB_TITLE_CUSTOM) {
                  setForm((f) => ({ ...f, jobTitle: '' }));
                } else {
                  setForm((f) => ({ ...f, jobTitle: v }));
                }
              }}
            >
              <option value="">{t('adminUsers.inviteJobTitlePlaceholderSelect')}</option>
              {jobTitleOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
              <option value={JOB_TITLE_CUSTOM}>{t('adminUsers.inviteJobTitleCustom')}</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('adminUsers.inviteJobTitleCatalogHint')}</p>
          </label>
          {jobTitleSelect === JOB_TITLE_CUSTOM ? (
            <label className="block">
              <span className={adminLabelClass()}>{t('adminUsers.inviteJobTitleCustomLabel')}</span>
              <input
                required
                className={adminInputClass()}
                placeholder={t('adminUsers.inviteJobTitlePlaceholder')}
                value={form.jobTitle}
                onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
              />
            </label>
          ) : null}
          <Link
            to="/app/admin/rbac/positions"
            className="inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t('adminUsers.inviteJobTitleManageLink')}
          </Link>
        </div>

        <label className="block">
          <span className={adminLabelClass()}>{t('adminUsers.membershipRole')}</span>
          <select
            className={adminInputClass()}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="member">{t('adminUsers.roleMember')}</option>
            <option value="hr">{t('adminUsers.roleHr')}</option>
            <option value="admin">{t('adminUsers.roleAdmin')}</option>
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('adminUsers.membershipRoleInviteHint')}</p>
        </label>

        <p className="text-xs text-muted-foreground">{t('adminUsers.inviteSelfServeHint')}</p>

        <button type="submit" disabled={saving || !departments.length} className={adminPrimaryBtnClass('w-full sm:w-auto')}>
          {saving ? t('common.saving') : t('companyAdmin.sendInvite')}
        </button>
      </form>

      {manualInviteUrl ? (
        <div className="mx-auto mt-4 max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-foreground">{t('adminUsers.inviteManualLinkTitle')}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{manualInviteUrl}</p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(manualInviteUrl);
                toast.success(t('adminUsers.inviteLinkCopied'));
              } catch {
                toast.error(t('adminUsers.inviteLinkCopyFail'));
              }
            }}
          >
            {t('adminUsers.copyInviteLink')}
          </button>
        </div>
      ) : null}
    </AdminUserFormCard>
  );

  if (embedded) return body;
  return <AdminUserPanelShell title={t('adminUsers.createTitle')}>{body}</AdminUserPanelShell>;
}
