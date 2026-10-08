import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

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
  const fieldId = useId();
  const [policy, setPolicy] = useState(defaultPolicy);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const audienceLabel = (key) => {
    const i18nKey = `adminTasks.visibilityAudience.${key}`;
    const label = t(i18nKey);
    return label === i18nKey ? key : label;
  };

  const levelLabel = (lv) => {
    const i18nKey = `adminTasks.visibilityLevel.${lv}`;
    const label = t(i18nKey);
    return label === i18nKey ? lv : label;
  };

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await organizationAPI.getProjectVisibilityPolicy(orgId);
      const data = unwrap(res);
      if (data?.policy) setPolicy(data.policy);
      else setPolicy(defaultPolicy());
      setLoadedOnce(true);
    } catch (error) {
      setLoadError(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminTasks.visibilityPolicyLoadFail'),
        })
      );
      setLoadedOnce(false);
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

  let body;
  if (loading && !loadedOnce) {
    body = <AdminListSkeleton rows={6} />;
  } else if (loadError) {
    body = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />;
  } else {
    body = (
      <div className="space-y-4">
        <AdminUserFormCard title={t('adminTasks.visibilityPolicyDiscoverTitle')}>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('adminTasks.visibilityPolicyDiscoverHint')}
          </p>
          <ul className="space-y-2">
            {rows.map(({ key, locked }) => (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
              >
                <label
                  htmlFor={`${fieldId}-discover-${key}`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <input
                    id={`${fieldId}-discover-${key}`}
                    type="checkbox"
                    checked={Boolean(policy.discoverAudiences?.[key])}
                    disabled={locked}
                    onChange={(e) => setDiscover(key, e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {audienceLabel(key)}
                </label>
                <select
                  className={adminInputClass('max-w-[11rem] !py-1.5 text-xs')}
                  value={policy.defaultInformationLevels?.[key] || 'summary'}
                  aria-label={`${audienceLabel(key)} — ${t('adminTasks.visibilityLevelLabel')}`}
                  onChange={(e) => setLevel(key, e.target.value)}
                >
                  {LEVELS.map((lv) => (
                    <option key={lv} value={lv}>
                      {levelLabel(lv)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </AdminUserFormCard>

        <AdminUserFormCard title={t('adminTasks.visibilityPolicyOverrideTitle')}>
          <label
            htmlFor={`${fieldId}-override`}
            className="flex items-center gap-2 text-sm"
          >
            <input
              id={`${fieldId}-override`}
              type="checkbox"
              checked={Boolean(policy.allowProjectManagerOverride)}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  allowProjectManagerOverride: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {t('adminTasks.visibilityPolicyAllowOverride')}
          </label>
        </AdminUserFormCard>

        <button
          type="button"
          className={adminPrimaryBtnClass()}
          disabled={saving}
          aria-busy={saving}
          onClick={() => void save()}
        >
          <AdminBusySpinner busy={saving} />
          {t('adminTasks.visibilityPolicySave')}
        </button>
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.policies')}
      hint={t('adminTasks.visibilityPolicyHint')}
      wide
    >
      {body}
    </AdminUserPanelShell>
  );
}
