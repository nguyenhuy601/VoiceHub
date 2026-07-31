import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAuth } from '../../context/AuthContext';
import { organizationAPI } from '../../services/api/organizationAPI';
import { projectAPI, DEFAULT_PROJECT_ROLES } from '../../services/api/projectAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberDisplayName, memberUserId } from '../../utils/adminUserUtils';
import {
  DELEGATION_TEMPLATE_IDS,
  PROJECT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_PRIORITIES,
  PROJECT_METHODOLOGIES,
  buildCreateBoardPayload,
  validateCreateProjectIdentity,
} from './createProjectSeed';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const STEPS = ['identity', 'team', 'confirm'];

export default function CreateProjectWizardPanel({ orgId, onCreated, onCancel }) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const creatorUserId = String(user?.id || user?._id || user?.userId || '').trim();
  const { membersById } = useAdminMembers(orgId);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [visibilityMode, setVisibilityMode] = useState('inherit');
  const [relatedDepartmentIds, setRelatedDepartmentIds] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [delegationTemplateId, setDelegationTemplateId] = useState('product');
  const [projectType, setProjectType] = useState('software');
  const [category, setCategory] = useState('internal');
  const [priority, setPriority] = useState('medium');
  const [methodology, setMethodology] = useState('kanban');
  const [sprintDurationDays, setSprintDurationDays] = useState('14');
  const [wipLimit, setWipLimit] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [catalogRoles, setCatalogRoles] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [respFilter, setRespFilter] = useState('');
  const [suggestedUserIds, setSuggestedUserIds] = useState(() => new Set());
  const [pickUserId, setPickUserId] = useState('');
  const [pickRoleKeys, setPickRoleKeys] = useState(() => new Set(['developer']));
  const [seedMembers, setSeedMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [createdBoardId, setCreatedBoardId] = useState('');

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [rolesRes, respRes, structureRes] = await Promise.all([
          projectAPI.listRoleCatalog(orgId),
          organizationAPI.listResponsibilities(orgId).catch(() => null),
          organizationAPI.getStructure(orgId).catch(() => null),
        ]);
        if (cancelled) return;
        const roles = unwrap(rolesRes);
        setCatalogRoles(Array.isArray(roles) && roles.length ? roles : DEFAULT_PROJECT_ROLES);
        const respList = unwrap(respRes);
        setResponsibilities(Array.isArray(respList) ? respList : respList?.items || []);
        const structure = unwrap(structureRes);
        const deps = Array.isArray(structure?.departments) ? structure.departments : [];
        setDepartments(deps);
      } catch {
        if (!cancelled) setCatalogRoles(DEFAULT_PROJECT_ROLES);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !respFilter) {
      setSuggestedUserIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.listResponsibilityUsersByKey(orgId, respFilter);
        const data = unwrap(res);
        const ids = Array.isArray(data?.userIds) ? data.userIds : Array.isArray(data) ? data : [];
        if (!cancelled) setSuggestedUserIds(new Set(ids.map(String)));
      } catch {
        if (!cancelled) setSuggestedUserIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, respFilter]);

  const suggestedFilter = useCallback(
    (m) => {
      if (!respFilter || !suggestedUserIds.size) return true;
      return suggestedUserIds.has(memberUserId(m));
    },
    [respFilter, suggestedUserIds]
  );

  const togglePickRole = (key) => {
    setPickRoleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addSeedMember = () => {
    const uid = String(pickUserId || '').trim();
    if (!uid) {
      toast.error(t('adminTasks.createNeedUser'));
      return;
    }
    const keys = [...pickRoleKeys];
    if (!keys.length) {
      toast.error(t('adminTasks.createNeedRoles'));
      return;
    }
    setSeedMembers((prev) => {
      const rest = prev.filter((m) => m.userId !== uid);
      return [...rest, { userId: uid, projectRoleKeys: keys }];
    });
    toast.success(t('adminTasks.createMemberQueued'));
  };

  const removeSeedMember = (uid) => {
    setSeedMembers((prev) => prev.filter((m) => m.userId !== uid));
  };

  const identityForm = {
    title,
    description,
    dueDate,
    startDate,
    expectedEndDate: dueDate,
    visibility,
    visibilityMode,
    relatedDepartmentIds,
    delegationTemplateId,
    members: seedMembers,
    projectType,
    category,
    priority,
    methodology,
    sprintDurationDays,
    wipLimit,
    customerName,
    customerCompany,
  };

  const goNext = () => {
    if (step === 0) {
      const err = validateCreateProjectIdentity(identityForm);
      if (err === 'title') {
        toast.error(t('adminTasks.createNeedTitle'));
        return;
      }
      if (err === 'customer') {
        toast.error('Customer bắt buộc khi Category = customer');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    const err = validateCreateProjectIdentity(identityForm);
    if (err) {
      if (err === 'customer') toast.error('Customer bắt buộc khi Category = customer');
      else toast.error(t('adminTasks.createNeedTitle'));
      setStep(0);
      return;
    }
    if (!orgId || busy) return;
    setBusy(true);
    try {
      const payload = buildCreateBoardPayload(identityForm, {
        organizationId: orgId,
        creatorUserId,
        scopeLabel: 'ORG',
      });
      const res = await projectAPI.create(payload);
      const created = unwrap(res);
      const boardId = String(created?.defaultBoardId || created?.board?._id || '').trim();
      const projectId = String(created?._id || created?.projectId || '').trim();
      setCreatedBoardId(boardId);
      toast.success(t('adminTasks.createSuccess'));
      onCreated?.({
        ...created,
        _id: boardId,
        projectId,
        defaultBoardId: boardId,
      });
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.createFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (createdBoardId) {
    return (
      <AdminUserFormCard title={t('adminTasks.createDoneTitle')}>
        <p className="text-sm text-muted-foreground">{t('adminTasks.createDoneHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/app/admin/projects/settings?boardId=${encodeURIComponent(createdBoardId)}`}
            className={adminSecondaryBtnClass()}
          >
            {t('adminDomains.projects.settings')}
          </Link>
          <Link
            to={`/app/admin/projects/project-team?boardId=${encodeURIComponent(createdBoardId)}`}
            className={adminSecondaryBtnClass()}
          >
            {t('adminTasks.openTeam')}
          </Link>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => onCancel?.()}>
            {t('adminTasks.createBackToList')}
          </button>
        </div>
      </AdminUserFormCard>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('adminTasks.createTitle')}</h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={i === step ? 'font-semibold text-foreground' : undefined}
            >
              {i + 1}. {t(`adminTasks.createStep_${s}`)}
            </span>
          ))}
        </div>
      </div>

      {step === 0 ? (
        <AdminUserFormCard title={t('adminTasks.createStep_identity')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldTitle')}</span>
              <input
                className={adminInputClass()}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldDue')}</span>
              <input
                type="date"
                className={adminInputClass()}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldDesc')}</span>
              <textarea
                className={adminInputClass()}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={adminLabelClass()}>Project type</span>
              <select className={adminInputClass()} value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                {PROJECT_TYPES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>Category</span>
              <select className={adminInputClass()} value={category} onChange={(e) => setCategory(e.target.value)}>
                {PROJECT_CATEGORIES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>Priority</span>
              <select className={adminInputClass()} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PROJECT_PRIORITIES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>Start date</span>
              <input type="date" className={adminInputClass()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block">
              <span className={adminLabelClass()}>Methodology</span>
              <select className={adminInputClass()} value={methodology} onChange={(e) => setMethodology(e.target.value)}>
                {PROJECT_METHODOLOGIES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            {methodology === 'scrum' ? (
              <label className="block">
                <span className={adminLabelClass()}>Sprint duration (days)</span>
                <input className={adminInputClass()} type="number" min={1} value={sprintDurationDays} onChange={(e) => setSprintDurationDays(e.target.value)} />
              </label>
            ) : null}
            {methodology === 'kanban' ? (
              <label className="block">
                <span className={adminLabelClass()}>WIP limit</span>
                <input className={adminInputClass()} type="number" min={0} value={wipLimit} onChange={(e) => setWipLimit(e.target.value)} />
              </label>
            ) : null}
            {category === 'customer' ? (
              <>
                <label className="block">
                  <span className={adminLabelClass()}>Customer *</span>
                  <input className={adminInputClass()} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </label>
                <label className="block">
                  <span className={adminLabelClass()}>Company</span>
                  <input className={adminInputClass()} value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} />
                </label>
              </>
            ) : null}
            <label className="block sm:col-span-2">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldVisibilityMode')}</span>
              <select
                className={adminInputClass()}
                value={visibilityMode}
                onChange={(e) => setVisibilityMode(e.target.value)}
              >
                <option value="inherit">{t('adminTasks.createVisInherit')}</option>
                <option value="custom">{t('adminTasks.createVisCustom')}</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldRelatedDepts')}</span>
              <p className="mb-1 text-[11px] text-muted-foreground">
                {t('adminTasks.createRelatedDeptsHint')}
              </p>
              <div className="max-h-36 space-y-1 overflow-auto rounded-lg border border-border p-2">
                {!departments.length ? (
                  <p className="text-xs text-muted-foreground">{t('adminTasks.createNoDepartments')}</p>
                ) : (
                  departments.map((d) => {
                    const id = String(d._id || d.id || '');
                    const checked = relatedDepartmentIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setRelatedDepartmentIds((prev) =>
                              checked ? prev.filter((x) => x !== id) : [...prev, id]
                            );
                          }}
                        />
                        {d.name || id}
                      </label>
                    );
                  })
                )}
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className={adminLabelClass()}>{t('adminTasks.createFieldVisibilityLegacy')}</span>
              <select
                className={adminInputClass()}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="private">{t('adminTasks.createVisPrivate')}</option>
                <option value="workspace">{t('adminTasks.createVisWorkspace')}</option>
              </select>
            </label>
          </div>
          {visibilityMode === 'inherit' ? (
            <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t('adminTasks.createVisInheritHint')}
            </p>
          ) : (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {t('adminTasks.createVisCustomHint')}
            </p>
          )}
        </AdminUserFormCard>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminTasks.createRespFilter')}</span>
              <select
                className={adminInputClass()}
                value={respFilter}
                onChange={(e) => setRespFilter(e.target.value)}
              >
                <option value="">{t('adminTasks.createRespAll')}</option>
                {responsibilities.map((r) => (
                  <option key={String(r.key || r._id)} value={String(r.key || '')}>
                    {r.label || r.key}
                  </option>
                ))}
              </select>
            </label>
            <AdminUserPicker
              orgId={orgId}
              selectedUserId={pickUserId}
              onSelect={setPickUserId}
              filterFn={respFilter ? suggestedFilter : undefined}
              hint={t('adminTasks.createPickerHint')}
              subtitleFn={(m) =>
                suggestedUserIds.has(memberUserId(m))
                  ? t('adminTasks.createSuggested')
                  : undefined
              }
            />
          </div>
          <div className="space-y-3">
            <AdminUserFormCard title={t('adminTasks.createRolesForPick')}>
              <div className="flex flex-wrap gap-2">
                {catalogRoles.map((r) => {
                  const key = String(r.key || '');
                  const checked = pickRoleKeys.has(key);
                  return (
                    <label
                      key={key}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                        checked ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePickRole(key)}
                      />
                      {r.label || key}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className={`${adminPrimaryBtnClass()} mt-3`}
                onClick={addSeedMember}
              >
                {t('adminTasks.createAddMember')}
              </button>
            </AdminUserFormCard>
            <AdminUserFormCard title={t('adminTasks.createSeedList')}>
              {!seedMembers.length ? (
                <p className="text-sm text-muted-foreground">{t('adminTasks.createSeedEmpty')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {seedMembers.map((m) => (
                    <li
                      key={m.userId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <span>
                        {memberDisplayName(membersById.get(m.userId)) || m.userId}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {m.projectRoleKeys.join(', ')}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                        onClick={() => removeSeedMember(m.userId)}
                      >
                        {t('adminTasks.createRemoveMember')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </AdminUserFormCard>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <AdminUserFormCard title={t('adminTasks.createStep_confirm')}>
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">{t('adminTasks.createFieldTitle')}: </span>
              {title}
            </p>
            <p>
              <span className="text-muted-foreground">{t('adminTasks.createFieldVisibility')}: </span>
              {visibility}
            </p>
            <p>
              <span className="text-muted-foreground">{t('adminTasks.createSeedList')}: </span>
              {seedMembers.length}
            </p>
            <fieldset>
              <legend className={adminLabelClass()}>{t('adminTasks.createTemplate')}</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {DELEGATION_TEMPLATE_IDS.map((id) => (
                  <label key={id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="delegationTemplate"
                      checked={delegationTemplateId === id}
                      onChange={() => setDelegationTemplateId(id)}
                    />
                    {t(`adminTasks.createTemplate_${id}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            {visibility === 'workspace' ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                {t('adminTasks.createWorkspaceWarn')}
              </p>
            ) : null}
          </div>
        </AdminUserFormCard>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className={adminSecondaryBtnClass()} onClick={() => onCancel?.()}>
          {t('nav.cancel')}
        </button>
        <div className="flex gap-2">
          {step > 0 ? (
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              onClick={() => setStep((s) => s - 1)}
              disabled={busy}
            >
              {t('adminTasks.createBack')}
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className={adminPrimaryBtnClass()} onClick={goNext}>
              {t('adminTasks.createNext')}
            </button>
          ) : (
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              onClick={submit}
              disabled={busy}
            >
              {busy ? t('adminTasks.createSubmitting') : t('adminTasks.createSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
