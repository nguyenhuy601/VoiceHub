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
import {
  PRIMARY_DOMAINS,
  SKILL_WHITELIST,
  YEARS_EXPERIENCE_MAX,
  HIRE_SKILLS_MAX,
} from '../../constants/capabilityCatalog';

const MAX_INVITE_PAST_PROJECTS = 5;

function emptyPastProject() {
  return { name: '', role: '', work: '', year: '' };
}

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
  const [includeHireCapability, setIncludeHireCapability] = useState(false);
  const [skillToAdd, setSkillToAdd] = useState('');
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'member',
    departmentId: '',
    jobTitle: '',
    primaryDomain: '',
    skills: [],
    yearsExperience: '',
    maxConcurrentProjects: 2,
    pastProjects: [],
  });

  const availableSkills = useMemo(() => {
    const taken = new Set((form.skills || []).map((n) => String(n)));
    return SKILL_WHITELIST.filter((name) => !taken.has(name));
  }, [form.skills]);

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
    if (includeHireCapability) {
      const years = Number(form.yearsExperience);
      if (!PRIMARY_DOMAINS.includes(form.primaryDomain) || !(form.skills || []).length || !Number.isFinite(years) || years < 0) {
        toast.error(t('adminUsers.inviteHireKnIncomplete'));
        return;
      }
    }
    setSaving(true);
    setManualInviteUrl('');
    try {
      const payload = {
        email,
        firstName: String(form.firstName || '').trim(),
        lastName: String(form.lastName || '').trim(),
        role: form.role || 'member',
        departmentId: String(form.departmentId || '').trim(),
        jobTitle: String(form.jobTitle || '').trim(),
      };
      if (includeHireCapability) {
        payload.includeHireCapability = true;
        payload.primaryDomain = form.primaryDomain;
        payload.skills = (form.skills || []).map((name) => String(name));
        payload.yearsExperience = Number(form.yearsExperience);
        payload.maxConcurrentProjects = Math.max(1, Math.min(20, Number(form.maxConcurrentProjects) || 2));
        payload.pastProjects = (form.pastProjects || [])
          .map((p) => ({
            name: String(p.name || '').trim(),
            role: String(p.role || '').trim(),
            work: String(p.work || '').trim(),
            year: String(p.year || '').trim(),
          }))
          .filter((p) => p.name || p.role || p.work || p.year);
      }
      const res = await organizationAPI.inviteMemberByEmail(orgId, payload);
      const body = unwrapApiData(res) || res?.data || res;
      const data = body?.data || body;
      const inviteUrl = String(data?.inviteUrl || '').trim();
      const emailSent = data?.emailSent !== false;
      const assignedCode = String(data?.employeeCode || '').trim();

      const hireApplied = data?.hireCapabilityApplied === true;
      if (emailSent) {
        toast.success(
          hireApplied && assignedCode
            ? t('adminUsers.inviteSentWithKn', { email, code: assignedCode })
            : assignedCode
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
        primaryDomain: '',
        skills: [],
        yearsExperience: '',
        maxConcurrentProjects: 2,
        pastProjects: [],
      });
      setJobTitleSelect('');
      setIncludeHireCapability(false);
      setSkillToAdd('');
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

        <label className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={includeHireCapability}
            onChange={(e) => setIncludeHireCapability(e.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">{t('adminUsers.inviteHireKnToggle')}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t('adminUsers.inviteHireKnHint')}</span>
          </span>
        </label>

        {includeHireCapability ? (
          <div className="space-y-4 rounded-xl border border-border/80 p-3">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminUsers.inviteHireDomain')}</span>
              <select
                className={adminInputClass()}
                value={form.primaryDomain}
                onChange={(e) => setForm((f) => ({ ...f, primaryDomain: e.target.value }))}
              >
                <option value="">{t('settingsCapability.selectPlaceholder')}</option>
                {PRIMARY_DOMAINS.map((code) => (
                  <option key={code} value={code}>
                    {t(`settingsCapability.domains.${code}`)}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className={adminLabelClass()}>{t('adminUsers.inviteHireSkills')}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <select
                  className={`${adminInputClass()} min-w-[10rem] flex-1`}
                  value={skillToAdd}
                  onChange={(e) => setSkillToAdd(e.target.value)}
                >
                  <option value="">{t('adminUsers.inviteHireSkillPlaceholder')}</option>
                  {availableSkills.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={adminPrimaryBtnClass()}
                  onClick={() => {
                    const name = String(skillToAdd || '').trim();
                    if (!name || !SKILL_WHITELIST.includes(name)) return;
                    setForm((f) => {
                      if (f.skills.includes(name)) return f;
                      if (f.skills.length >= HIRE_SKILLS_MAX) {
                        toast.error(t('settingsCapability.maxSkills', { n: HIRE_SKILLS_MAX }));
                        return f;
                      }
                      return { ...f, skills: [...f.skills, name] };
                    });
                    setSkillToAdd('');
                  }}
                >
                  {t('adminUsers.inviteHireAddSkill')}
                </button>
              </div>
              {form.skills.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {form.skills.map((name) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {name}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setForm((f) => ({ ...f, skills: f.skills.filter((s) => s !== name) }))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.inviteHireYears')}</span>
                <input
                  type="number"
                  min={0}
                  max={YEARS_EXPERIENCE_MAX}
                  className={adminInputClass()}
                  value={form.yearsExperience}
                  onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminUsers.inviteHireMaxProjects')}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className={adminInputClass()}
                  value={form.maxConcurrentProjects}
                  onChange={(e) => setForm((f) => ({ ...f, maxConcurrentProjects: e.target.value }))}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className={adminLabelClass()}>{t('adminUsers.inviteHirePastProjects')}</span>
              {(form.pastProjects || []).map((p, idx) => (
                <div key={`past-${idx}`} className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-2">
                  <input
                    className={adminInputClass()}
                    placeholder={t('adminUsers.inviteHireProjectName')}
                    value={p.name}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.pastProjects];
                        next[idx] = { ...next[idx], name: e.target.value };
                        return { ...f, pastProjects: next };
                      })
                    }
                  />
                  <input
                    className={adminInputClass()}
                    placeholder={t('adminUsers.inviteHireProjectRole')}
                    value={p.role}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.pastProjects];
                        next[idx] = { ...next[idx], role: e.target.value };
                        return { ...f, pastProjects: next };
                      })
                    }
                  />
                  <input
                    className={`${adminInputClass()} sm:col-span-2`}
                    placeholder={t('adminUsers.inviteHireProjectWork')}
                    value={p.work}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.pastProjects];
                        next[idx] = { ...next[idx], work: e.target.value };
                        return { ...f, pastProjects: next };
                      })
                    }
                  />
                  <input
                    type="number"
                    className={adminInputClass()}
                    placeholder={t('adminUsers.inviteHireProjectYear')}
                    value={p.year}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.pastProjects];
                        next[idx] = { ...next[idx], year: e.target.value };
                        return { ...f, pastProjects: next };
                      })
                    }
                  />
                  <button
                    type="button"
                    className="text-xs font-medium text-destructive underline-offset-2 hover:underline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        pastProjects: f.pastProjects.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ))}
              {(form.pastProjects || []).length < MAX_INVITE_PAST_PROJECTS ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      pastProjects: [...(f.pastProjects || []), emptyPastProject()],
                    }))
                  }
                >
                  {t('adminUsers.inviteHireAddProject')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

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
