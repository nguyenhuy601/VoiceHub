import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApiData } from '../../utils/helpers';
import { queryKeys } from '../../lib/queryKeys';

const PERSONAS = [
  { key: 'submitter', labelKey: 'personaSubmitter' },
  { key: 'approver', labelKey: 'personaApprover' },
  { key: 'operator', labelKey: 'personaOperator' },
  { key: 'member', labelKey: 'personaMember' },
];

const ACTION_KEYS = [
  { key: 'view', labelKey: 'actionView' },
  { key: 'import', labelKey: 'actionImport' },
  { key: 'submit', labelKey: 'actionSubmit' },
  { key: 'approve', labelKey: 'actionApprove' },
  { key: 'runAiPlanning', labelKey: 'actionRunAi' },
  { key: 'createProject', labelKey: 'actionCreateProject' },
  { key: 'reviewSkills', labelKey: 'actionReviewSkills' },
];

const VISIBILITY_KEYS = [
  { key: 'collaborateRequirements', labelKey: 'visibilityCollaborate' },
  { key: 'adminRequirements', labelKey: 'visibilityAdmin' },
];

function defaultPolicy() {
  return {
    version: 1,
    personaByPosition: {
      submitter: { positionKeys: ['business_analyst'], projectRoleKeys: ['business_analyst'], aliases: [] },
      approver: {
        positionKeys: ['product_manager'],
        projectRoleKeys: ['product_owner', 'project_manager'],
        aliases: ['product owner', 'project manager'],
      },
    },
    personaByOrgRole: {
      operator: { membershipRoles: ['owner', 'admin', 'hr'] },
    },
    visibility: {
      submitter: { collaborateRequirements: true, adminRequirements: false },
      approver: { collaborateRequirements: true, adminRequirements: false },
      operator: { collaborateRequirements: false, adminRequirements: true },
      member: { collaborateRequirements: false, adminRequirements: false },
    },
    actions: {
      submitter: {
        view: true,
        import: true,
        submit: true,
        approve: false,
        runAiPlanning: false,
        createProject: false,
        reviewSkills: true,
      },
      approver: {
        view: true,
        import: false,
        submit: false,
        approve: true,
        runAiPlanning: true,
        createProject: true,
        reviewSkills: true,
      },
      operator: {
        view: true,
        import: true,
        submit: true,
        approve: false,
        runAiPlanning: true,
        createProject: false,
        reviewSkills: true,
      },
      member: {
        view: true,
        import: false,
        submit: false,
        approve: false,
        runAiPlanning: false,
        createProject: false,
        reviewSkills: false,
      },
    },
  };
}

function togglePositionKey(policy, personaKey, positionKey, checked) {
  const next = structuredClone(policy);
  const row = next.personaByPosition[personaKey] || {
    positionKeys: [],
    projectRoleKeys: [],
    aliases: [],
  };
  const set = new Set(row.positionKeys || []);
  if (checked) set.add(positionKey);
  else set.delete(positionKey);
  row.positionKeys = [...set];
  next.personaByPosition[personaKey] = row;
  return next;
}

function toggleAction(policy, personaKey, actionKey, checked) {
  const next = structuredClone(policy);
  next.actions[personaKey] = {
    ...(next.actions[personaKey] || {}),
    [actionKey]: Boolean(checked),
  };
  return next;
}

function toggleVisibility(policy, personaKey, visKey, checked) {
  const next = structuredClone(policy);
  next.visibility[personaKey] = {
    ...(next.visibility[personaKey] || {}),
    [visKey]: Boolean(checked),
  };
  return next;
}

export default function RequirementAccessPolicyPanel({ orgId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const sk = (suffix) => `adminDomains.requirements.accessPolicy.${suffix}`;
  const [policy, setPolicy] = useState(defaultPolicy);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [policyRes, masterRes] = await Promise.all([
        organizationAPI.getRequirementAccessPolicy(orgId),
        organizationAPI.getMasterData(orgId),
      ]);
      const policyData = unwrapApiData(policyRes);
      if (policyData?.policy) setPolicy(policyData.policy);

      const master = unwrapApiData(masterRes) || {};
      const catalog = Array.isArray(master.positions) ? master.positions : [];
      const enabled = new Set(master.enabledPositionKeys || []);
      setPositions(
        catalog
          .filter((p) => !enabled.size || enabled.has(p.key))
          .map((p) => ({ key: p.key, label: p.label || p.key }))
      );
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t(sk('loadFail')) })
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, t, sk]);

  useEffect(() => {
    load();
  }, [load]);

  const previewLines = useMemo(
    () => [
      t(sk('previewBa')),
      t(sk('previewPm')),
      t(sk('previewOperator')),
    ],
    [t, sk]
  );

  const save = async () => {
    if (!orgId || saving) return;
    setSaving(true);
    try {
      const res = await organizationAPI.putRequirementAccessPolicy(orgId, policy);
      const data = unwrapApiData(res);
      if (data?.policy) setPolicy(data.policy);
      await queryClient.invalidateQueries({ queryKey: queryKeys.requirements.access(orgId) });
      toast.success(t(sk('saveSuccess')));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t(sk('saveFail')) })
      );
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm(t(sk('resetConfirm')))) return;
    const defaults = defaultPolicy();
    setPolicy(defaults);
    setSaving(true);
    try {
      const res = await organizationAPI.putRequirementAccessPolicy(orgId, defaults);
      const data = unwrapApiData(res);
      if (data?.policy) setPolicy(data.policy);
      await queryClient.invalidateQueries({ queryKey: queryKeys.requirements.access(orgId) });
      toast.success(t(sk('resetSuccess')));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t(sk('saveFail')) })
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t(sk('loading'))}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t(sk('hint'))}</p>

      <AdminUserFormCard title={t(sk('mappingTitle'))}>
        <p className="mb-3 text-xs text-muted-foreground">{t(sk('mappingHint'))}</p>
        <div className="space-y-4">
          {['submitter', 'approver'].map((personaKey) => (
            <div key={personaKey} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium">
                {t(sk(personaKey === 'submitter' ? 'personaSubmitter' : 'personaApprover'))}
              </p>
              <div className="flex flex-wrap gap-2">
                {positions.map((pos) => {
                  const checked = (policy.personaByPosition?.[personaKey]?.positionKeys || []).includes(
                    pos.key
                  );
                  return (
                    <label
                      key={`${personaKey}-${pos.key}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setPolicy((prev) =>
                            togglePositionKey(prev, personaKey, pos.key, e.target.checked)
                          )
                        }
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {pos.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AdminUserFormCard>

      <AdminUserFormCard title={t(sk('visibilityTitle'))}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-2">{t(sk('colPersona'))}</th>
                {VISIBILITY_KEYS.map((col) => (
                  <th key={col.key} className="px-2 py-2">
                    {t(sk(col.labelKey))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERSONAS.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <td className="px-2 py-2 font-medium">{t(sk(row.labelKey))}</td>
                  {VISIBILITY_KEYS.map((col) => (
                    <td key={col.key} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(policy.visibility?.[row.key]?.[col.key])}
                        onChange={(e) =>
                          setPolicy((prev) =>
                            toggleVisibility(prev, row.key, col.key, e.target.checked)
                          )
                        }
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminUserFormCard>

      <AdminUserFormCard title={t(sk('actionsTitle'))}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-2">{t(sk('colPersona'))}</th>
                {ACTION_KEYS.map((col) => (
                  <th key={col.key} className="px-2 py-2 whitespace-nowrap">
                    {t(sk(col.labelKey))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERSONAS.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <td className="px-2 py-2 font-medium">{t(sk(row.labelKey))}</td>
                  {ACTION_KEYS.map((col) => (
                    <td key={col.key} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(policy.actions?.[row.key]?.[col.key])}
                        onChange={(e) =>
                          setPolicy((prev) =>
                            toggleAction(prev, row.key, col.key, e.target.checked)
                          )
                        }
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminUserFormCard>

      <AdminUserFormCard title={t(sk('previewTitle'))}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {previewLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </AdminUserFormCard>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={adminPrimaryBtnClass()} disabled={saving} onClick={save}>
          {saving ? '…' : t(sk('save'))}
        </button>
        <button
          type="button"
          className={adminSecondaryBtnClass()}
          disabled={saving}
          onClick={resetDefaults}
        >
          {t(sk('reset'))}
        </button>
      </div>
    </div>
  );
}
