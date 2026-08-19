import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  memberDisplayName,
  memberUserId,
} from '../../../utils/adminUserUtils';
import { flattenOrgStructureDepartments } from '../../../utils/orgMemberStructureScope';
import {
  asId,
  buildPlannerLoadByUserId,
  filterMembersByRelatedDepts,
} from '../../../utils/wizardRelatedDeptMembers';
import useAdminMembers from '../../../hooks/useAdminMembers';
import { organizationAPI } from '../../../services/api/organizationAPI';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { WIZARD_DEFAULT_MEMBER_ROLE } from './projectWizardConstants';
import { collectWizardRosterKeys, deliveryRosterStatus } from './projectDeliveryRoster';
import { pickNamedMember, resolveWizardMemberLabel } from './projectWizardMemberLabel';
import { wizardUi } from './projectWizardUi';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function ProjectWizardStepTeam({
  orgId,
  form,
  patchForm,
  catalogRoles,
  addSeedMember,
  removeSeedMember,
  defaultMemberRole = WIZARD_DEFAULT_MEMBER_ROLE,
  t,
}) {
  const { members, membersByIdAll } = useAdminMembers(orgId);
  const [pickUserId, setPickUserId] = useState('');
  const [pickRole, setPickRole] = useState(defaultMemberRole || 'developer');
  const [structureDepts, setStructureDepts] = useState([]);
  const [filterDeptId, setFilterDeptId] = useState('');
  const [plannerByUser, setPlannerByUser] = useState(() => new Map());
  const [deptRoster, setDeptRoster] = useState([]);

  const scale = form.participationScale === 'department' ? 'department' : 'company';
  const relatedIds = useMemo(
    () =>
      (Array.isArray(form.relatedDepartmentIds) ? form.relatedDepartmentIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    [form.relatedDepartmentIds]
  );

  useEffect(() => {
    if (!orgId) {
      setStructureDepts([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getStructure(orgId);
        const structure = unwrap(res);
        if (cancelled) return;
        setStructureDepts(flattenOrgStructureDepartments(structure));
      } catch (err) {
        if (!cancelled) {
          setStructureDepts([]);
          toast.error(
            resolveApiErrorMessage(err, {
              t,
              fallback: t('adminTasks.wizardStructureLoadFail'),
            })
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  const deptNameById = useMemo(() => {
    const map = new Map();
    for (const d of structureDepts) {
      const id = asId(d);
      if (id) map.set(id, String(d.name || '').trim() || id.slice(-6));
    }
    return map;
  }, [structureDepts]);

  const viewDeptId =
    scale === 'department' ? String(relatedIds[0] || '') : String(filterDeptId || relatedIds[0] || '');

  useEffect(() => {
    if (scale !== 'company') return;
    if (relatedIds.length && !relatedIds.includes(filterDeptId)) {
      setFilterDeptId(relatedIds[0] || '');
    }
  }, [scale, relatedIds, filterDeptId]);

  useEffect(() => {
    if (!orgId || !viewDeptId) {
      setPlannerByUser(new Map());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.getResourcePlanner(
          orgId,
          {
            departmentId: viewDeptId,
            includeOverallocated: '1',
          },
          { skipPermissionDeniedToast: true }
        );
        const data = unwrap(res);
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        setPlannerByUser(buildPlannerLoadByUserId(items));
      } catch {
        if (!cancelled) setPlannerByUser(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, viewDeptId]);

  useEffect(() => {
    if (!orgId || !viewDeptId) {
      setDeptRoster([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getMembersWithRoles(orgId, { departmentId: viewDeptId });
        const data = unwrap(res);
        const list = Array.isArray(data?.members) ? data.members : [];
        if (!cancelled) setDeptRoster(list);
      } catch {
        if (!cancelled) setDeptRoster([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, viewDeptId]);

  const filteredByStructure = useMemo(
    () =>
      filterMembersByRelatedDepts(members, {
        deptIds: viewDeptId ? [viewDeptId] : [],
        structureDepts,
      }),
    [members, viewDeptId, structureDepts]
  );

  const viewMembers = useMemo(() => {
    const byId = new Map();
    const push = (row) => {
      const id = memberUserId(row);
      if (!id) return;
      const named = membersByIdAll?.get?.(id);
      const next = pickNamedMember(row, named, byId.get(id));
      byId.set(id, next || row);
    };
    for (const m of deptRoster) push(m);
    for (const m of filteredByStructure) push(m);
    return [...byId.values()];
  }, [deptRoster, filteredByStructure, membersByIdAll]);

  const optionLabel = (member) => {
    const name = memberDisplayName(member);
    const load = plannerByUser.get(memberUserId(member));
    if (load?.workloadFull) {
      return `${name} — ${t('adminTasks.wizardMemberFullLoadShort')}`;
    }
    if (load?.workloadPartial) {
      return `${name} — ${t('adminTasks.wizardMemberPartialLoadShort')}`;
    }
    return name;
  };

  const memberName = useMemo(
    () => (id) => resolveWizardMemberLabel(id, [viewMembers, deptRoster, membersByIdAll, members]),
    [viewMembers, deptRoster, membersByIdAll, members]
  );

  const roleOptions = (catalogRoles || []).length
    ? catalogRoles
    : [
        { key: 'developer', label: 'Developer' },
        { key: 'qa_engineer', label: 'QA' },
      ];

  const setScale = (nextScale) => {
    if (nextScale === 'department') {
      patchForm({
        participationScale: 'department',
        relatedDepartmentIds: relatedIds.slice(0, 1),
      });
      return;
    }
    patchForm({ participationScale: 'company' });
  };

  const toggleRelatedDept = (deptId) => {
    const id = String(deptId || '').trim();
    if (!id) return;
    const has = relatedIds.includes(id);
    const next = has ? relatedIds.filter((x) => x !== id) : [...relatedIds, id];
    patchForm({ relatedDepartmentIds: next });
    if (!has) setFilterDeptId(id);
  };

  const setSingleDept = (deptId) => {
    const id = String(deptId || '').trim();
    patchForm({ relatedDepartmentIds: id ? [id] : [] });
  };

  const onAddMember = () => {
    if (!pickUserId) return;
    addSeedMember(pickUserId, [pickRole]);
    setPickUserId('');
  };

  const roster = deliveryRosterStatus(collectWizardRosterKeys(form.seedMembers || []));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {t('adminTasks.wizardStepTeamBring') ||
            t('adminTasks.wizardStepTeam') ||
            'Bring your team'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('adminTasks.wizardStepTeamHint') || 'Thêm thành viên và chọn Project Role.'}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            {roster.hasProduct ? '✓' : '○'} {t('adminTasks.wizardRosterBandProduct')}
          </li>
          <li>
            {roster.hasFacilitate ? '✓' : '○'} {t('adminTasks.wizardRosterBandFacilitate')}
          </li>
          <li>
            {roster.hasBuild ? '✓' : '○'} {t('adminTasks.wizardRosterBandBuild')}
          </li>
        </ul>
      </div>

      <fieldset className="space-y-2">
        <legend className={wizardUi.fieldLabel}>{t('adminTasks.wizardParticipationScale')}</legend>
        <label className={wizardUi.checkRow}>
          <input
            type="radio"
            name="wizardParticipationScale"
            checked={scale === 'company'}
            onChange={() => setScale('company')}
          />
          <span className="text-sm text-foreground">{t('adminTasks.wizardScaleCompany')}</span>
        </label>
        <label className={wizardUi.checkRow}>
          <input
            type="radio"
            name="wizardParticipationScale"
            checked={scale === 'department'}
            onChange={() => setScale('department')}
          />
          <span className="text-sm text-foreground">{t('adminTasks.wizardScaleDepartment')}</span>
        </label>
        <p className="text-xs text-muted-foreground">
          {scale === 'company'
            ? t('adminTasks.wizardScaleCompanyHint')
            : t('adminTasks.wizardScaleDepartmentHint')}
        </p>
      </fieldset>

      {scale === 'company' ? (
        <div>
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardRelatedDepts')}</span>
          {!structureDepts.length ? (
            <p className="text-xs text-muted-foreground">{t('adminTasks.wizardNoStructureDepts')}</p>
          ) : (
            <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-auto rounded-lg border border-border p-2">
              {structureDepts.map((d) => {
                const id = asId(d);
                const checked = relatedIds.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                      checked ? 'bg-primary/10 font-medium' : 'hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRelatedDept(id)}
                    />
                    {deptNameById.get(id) || id}
                  </label>
                );
              })}
            </div>
          )}
          {relatedIds.length > 1 ? (
            <label className="mt-3 block">
              <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardFilterDept')}</span>
              <select
                className={wizardUi.select}
                value={viewDeptId}
                onChange={(e) => setFilterDeptId(e.target.value)}
              >
                {relatedIds.map((id) => (
                  <option key={id} value={id}>
                    {deptNameById.get(id) || id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <label className="block">
          <span className={wizardUi.fieldLabel}>{t('adminTasks.wizardSingleDept')}</span>
          <select
            className={wizardUi.select}
            value={relatedIds[0] || ''}
            onChange={(e) => setSingleDept(e.target.value)}
          >
            <option value="">{t('adminTasks.wizardPickOneDept')}</option>
            {structureDepts.map((d) => {
              const id = asId(d);
              return (
                <option key={id} value={id}>
                  {deptNameById.get(id) || id}
                </option>
              );
            })}
          </select>
        </label>
      )}

      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="mb-2 text-sm font-medium text-foreground">
          {t('adminTasks.wizardAddMembers') || 'Thêm thành viên'}
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select
            className={wizardUi.select}
            value={pickUserId}
            onChange={(e) => setPickUserId(e.target.value)}
            disabled={!viewDeptId}
          >
            <option value="">
              {!viewDeptId ? t('adminTasks.wizardPickDeptFirst') : t('adminTasks.createNeedUser')}
            </option>
            {viewMembers.map((m) => {
              const id = memberUserId(m);
              if (!id) return null;
              return (
                <option key={id} value={id}>
                  {optionLabel(m)}
                </option>
              );
            })}
          </select>
          <select
            className={wizardUi.select}
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value)}
          >
            {roleOptions.map((r) => {
              const key = r.key || r.id || r;
              const lab = r.label || r.name || key;
              return (
                <option key={key} value={key}>
                  {lab}
                </option>
              );
            })}
          </select>
          <button type="button" className={wizardUi.secondaryBtn} onClick={onAddMember}>
            {t('common.add') || 'Add'}
          </button>
        </div>
        {viewDeptId && !viewMembers.length ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('adminTasks.wizardNoDeptMembers')}</p>
        ) : null}

        <ul className="mt-3 flex flex-wrap gap-2">
          {(form.seedMembers || []).map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <span>
                {memberName(m.userId)} · {(m.projectRoleKeys || []).join(', ')}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => removeSeedMember(m.userId)}
              >
                ×
              </button>
            </li>
          ))}
          {!form.seedMembers?.length ? (
            <li className="text-xs text-muted-foreground">
              {t('adminTasks.wizardNoExtraMembers') || 'Chưa thêm thành viên phụ.'}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
