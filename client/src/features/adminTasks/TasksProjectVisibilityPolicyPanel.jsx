import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const AUDIENCE_LABEL_VI = {
  system_admins: 'System Admins',
  organization_admins: 'Organization Admins',
  directors: 'Directors',
  project_managers: 'Project Managers',
  project_members: 'Project Members',
  related_department_managers: 'Related Department Managers',
  related_department_members: 'Related Department Members',
  all_employees: 'All Employees',
};

const LEVEL_LABEL = {
  summary: 'Summary',
  details: 'Details',
  confidential: 'Confidential',
};

const AUDIENCES = [
  { key: 'system_admins', locked: true },
  { key: 'organization_admins' },
  { key: 'directors' },
  { key: 'project_managers' },
  { key: 'project_members' },
  { key: 'related_department_managers' },
  { key: 'related_department_members' },
  { key: 'all_employees' },
];

const LEVELS = ['summary', 'details', 'confidential'];

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function defaultPolicy() {
  return {
    discoverAudiences: {
      system_admins: true,
      organization_admins: true,
      directors: true,
      project_managers: true,
      project_members: true,
      related_department_managers: true,
      related_department_members: false,
      all_employees: false,
    },
    defaultInformationLevels: {
      system_admins: 'confidential',
      organization_admins: 'confidential',
      directors: 'details',
      project_managers: 'confidential',
      project_members: 'details',
      related_department_managers: 'summary',
      related_department_members: 'summary',
      all_employees: 'summary',
    },
    allowProjectManagerOverride: true,
  };
}

export default function TasksProjectVisibilityPolicyPanel({ orgId }) {
  const { t } = useAppStrings();
  const [policy, setPolicy] = useState(defaultPolicy);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getProjectVisibilityPolicy(orgId);
      const data = unwrap(res);
      if (data?.policy) setPolicy(data.policy);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminTasks.visibilityPolicyLoadFail'),
        })
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const setDiscover = (key, checked) => {
    if (key === 'system_admins') return;
    setPolicy((prev) => ({
      ...prev,
      discoverAudiences: { ...prev.discoverAudiences, [key]: Boolean(checked) },
    }));
  };

  const setLevel = (key, level) => {
    setPolicy((prev) => ({
      ...prev,
      defaultInformationLevels: { ...prev.defaultInformationLevels, [key]: level },
    }));
  };

  const save = async () => {
    if (!orgId || saving) return;
    setSaving(true);
    try {
      const res = await organizationAPI.putProjectVisibilityPolicy(orgId, policy);
      const data = unwrap(res);
      if (data?.policy) setPolicy(data.policy);
      toast.success(t('adminTasks.visibilityPolicySaved'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminTasks.visibilityPolicySaveFail'),
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => AUDIENCES, []);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.policies')}
      hint={t('adminTasks.visibilityPolicyHint')}
      wide
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="space-y-4">
          <AdminUserFormCard title={t('adminTasks.visibilityPolicyDiscoverTitle')}>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('adminTasks.visibilityPolicyDiscoverHint')}
            </p>
            <ul className="space-y-2">
              {rows.map(({ key, locked }) => (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(policy.discoverAudiences?.[key])}
                      disabled={locked}
                      onChange={(e) => setDiscover(key, e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {AUDIENCE_LABEL_VI[key] || key}
                  </label>
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    value={policy.defaultInformationLevels?.[key] || 'summary'}
                    onChange={(e) => setLevel(key, e.target.value)}
                  >
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {LEVEL_LABEL[lv] || lv}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.visibilityPolicyOverrideTitle')}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(policy.allowProjectManagerOverride)}
                onChange={(e) =>
                  setPolicy((prev) => ({
                    ...prev,
                    allowProjectManagerOverride: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {t('adminTasks.visibilityPolicyAllowOverride')}
            </label>
          </AdminUserFormCard>

          <button type="button" className={adminPrimaryBtnClass()} disabled={saving} onClick={save}>
            {saving ? '…' : t('adminTasks.visibilityPolicySave')}
          </button>
        </div>
      )}
    </AdminUserPanelShell>
  );
}
