import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { projectAPI, DEFAULT_PROJECT_ROLES } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskBoardDetailPayload } from '../../../services/api/taskAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { DEFAULT_PROJECT_ROLE_KEYS } from '../../../utils/roleTaxonomy';
import {
  buildCreateBoardPayload,
  validateCreateProjectIdentity,
  PROJECT_TYPES,
} from '../../adminTasks/createProjectSeed';
import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate';
import {
  PROJECT_WIZARD_STEPS,
  mapWorkflowCardToBackend,
  resolveWorkflowCard,
  defaultWorkTypesEnabled,
  defaultViewsEnabled,
  previewColumnsForCard,
  WIZARD_PM_ROLE,
  WIZARD_SM_ROLE,
  WIZARD_DEFAULT_MEMBER_ROLE,
  firstSeedMemberWithRole,
} from './projectWizardConstants';
import { collectWizardRosterKeys, deliveryRosterStatus } from './projectDeliveryRoster';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function emptyForm(initial = {}) {
  const title = String(initial.title || '');
  const explicitCode = String(initial.projectCode || '').trim();
  return {
    title,
    description: String(initial.description || initial.body || ''),
    projectType: PROJECT_TYPES.includes(String(initial.projectType || '').toLowerCase())
      ? String(initial.projectType).toLowerCase()
      : 'software',
    projectCode: explicitCode || (title.trim() ? buildProjectCodeBase({ title }) : ''),
    projectCodeTouched: Boolean(explicitCode),
    seedMembers: Array.isArray(initial.seedMembers) ? initial.seedMembers : [],
    participationScale: initial.participationScale === 'department' ? 'department' : 'company',
    relatedDepartmentIds: Array.isArray(initial.relatedDepartmentIds)
      ? initial.relatedDepartmentIds.map(String).filter(Boolean)
      : [],
    workflowCardId: String(initial.workflowCardId || 'kanban').toLowerCase(),
    sprintDurationDays: String(initial.sprintDurationDays || '14'),
    wipLimit: String(initial.wipLimit ?? '0'),
    visibility: initial.visibility === 'workspace' ? 'workspace' : 'private',
    dueDate: initial.dueDate ? String(initial.dueDate).slice(0, 10) : '',
    startDate: initial.startDate ? String(initial.startDate).slice(0, 10) : '',
    workTypes: { ...defaultWorkTypesEnabled(), ...(initial.workTypes || {}) },
    enabledViews: { ...defaultViewsEnabled(), ...(initial.enabledViews || {}) },
    sampleWorkItems: initial.sampleWorkItems !== false,
  };
}

export default function useCreateProjectWizard({
  organizationId,
  initialValues = null,
  resetKey = 0,
  onCreated,
  scopeLabel = 'ORG',
} = {}) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const creatorUserId = String(user?.id || user?._id || user?.userId || '').trim();

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('forward');
  const [setupPanel, setSetupPanel] = useState('');
  const [form, setForm] = useState(() => emptyForm(initialValues || {}));
  const [catalogRoles, setCatalogRoles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep(0);
    setSlideDir('forward');
    setSetupPanel('');
    setForm(emptyForm(initialValues || {}));
  }, [organizationId, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.listRoleCatalog(organizationId);
        if (cancelled) return;
        const roles = unwrap(res);
        setCatalogRoles(Array.isArray(roles) && roles.length ? roles : DEFAULT_PROJECT_ROLES);
      } catch {
        if (!cancelled) setCatalogRoles(DEFAULT_PROJECT_ROLES);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const patchForm = useCallback((partial) => {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (Object.prototype.hasOwnProperty.call(partial, 'title') && !next.projectCodeTouched) {
        const title = String(next.title || '');
        next.projectCode = title.trim() ? buildProjectCodeBase({ title }) : '';
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'projectCode')) {
        next.projectCode = String(partial.projectCode || '')
          .trim()
          .toUpperCase();
        next.projectCodeTouched = true;
      }
      return next;
    });
  }, []);

  const workflowMeta = useMemo(
    () => mapWorkflowCardToBackend(form.workflowCardId),
    [form.workflowCardId]
  );

  const previewColumns = useMemo(
    () => previewColumnsForCard(form.workflowCardId),
    [form.workflowCardId]
  );

  const validateStep = useCallback(
    (stepIndex) => {
      const id = PROJECT_WIZARD_STEPS[stepIndex];
      if (id === 'name') {
        const err = validateCreateProjectIdentity({ title: form.title, category: 'internal' });
        if (err === 'title') {
          toast.error(t('adminTasks.createNeedTitle'));
          return false;
        }
        return true;
      }
      if (id === 'setup') {
        const card = resolveWorkflowCard(form.workflowCardId);
        if (!card) {
          toast.error(t('adminTasks.wizardNeedStatuses') || 'Chọn Statuses / workflow.');
          return false;
        }
        return true;
      }
      if (id === 'team') {
        const scale = form.participationScale === 'department' ? 'department' : 'company';
        const depts = (Array.isArray(form.relatedDepartmentIds) ? form.relatedDepartmentIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean);
        if (scale === 'department' && depts.length !== 1) {
          toast.error(t('adminTasks.wizardNeedOneDept'));
          return false;
        }
        if (scale === 'company' && depts.length < 1) {
          toast.error(t('adminTasks.wizardNeedRelatedDepts'));
          return false;
        }
        const roster = deliveryRosterStatus(collectWizardRosterKeys(form.seedMembers));
        if (!roster.hasFacilitate) {
          toast.error(t('adminTasks.wizardRosterNeedFacilitate'));
          return false;
        }
        if (!roster.hasBuild) {
          toast.error(t('adminTasks.wizardRosterNeedBuild'));
          return false;
        }
        return true;
      }
      return true;
    },
    [form, t]
  );

  const goNext = useCallback(() => {
    if (setupPanel) {
      setSetupPanel('');
      return;
    }
    if (!validateStep(step)) return;
    setSlideDir('forward');
    setStep((s) => Math.min(s + 1, PROJECT_WIZARD_STEPS.length - 1));
  }, [step, validateStep, setupPanel]);

  const goBack = useCallback(() => {
    if (setupPanel) {
      setSetupPanel('');
      return;
    }
    setSlideDir('back');
    setStep((s) => Math.max(s - 1, 0));
  }, [setupPanel]);

  const addSeedMember = useCallback((userId, projectRoleKeys) => {
    const uid = String(userId || '').trim();
    const keys = (projectRoleKeys || []).map((k) => String(k || '').trim()).filter(Boolean);
    if (!uid || !keys.length) return;
    setForm((prev) => {
      const rest = (prev.seedMembers || []).filter((m) => m.userId !== uid);
      return { ...prev, seedMembers: [...rest, { userId: uid, projectRoleKeys: keys }] };
    });
  }, []);

  const removeSeedMember = useCallback((userId) => {
    const uid = String(userId || '').trim();
    setForm((prev) => ({
      ...prev,
      seedMembers: (prev.seedMembers || []).filter((m) => m.userId !== uid),
    }));
  }, []);

  const buildPayload = useCallback(() => {
    const { methodology, workflowTemplateKey } = mapWorkflowCardToBackend(form.workflowCardId);
    const seedMembers = [...(form.seedMembers || [])];
    const pm = firstSeedMemberWithRole(seedMembers, WIZARD_PM_ROLE || DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER);
    const sm = firstSeedMemberWithRole(seedMembers, WIZARD_SM_ROLE || DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER);

    const enabledWorkTypes = Object.entries(form.workTypes || {})
      .filter(([, on]) => on)
      .map(([k]) => k);
    const enabledViews = Object.entries(form.enabledViews || {})
      .filter(([, on]) => on)
      .map(([k]) => k);

    const payload = buildCreateBoardPayload(
      {
        title: form.title,
        description: form.description,
        projectType: form.projectType,
        category: 'internal',
        priority: 'medium',
        methodology,
        sprintDurationDays: form.sprintDurationDays,
        sprintStartDay: 'monday',
        wipLimit: form.wipLimit,
        visibility: form.visibility,
        visibilityMode: 'inherit',
        dueDate: form.dueDate,
        startDate: form.startDate,
        projectCode: form.projectCode,
        projectManagerId: pm,
        scrumMasterId: sm,
        seedMembers,
        relatedDepartmentIds: Array.isArray(form.relatedDepartmentIds)
          ? form.relatedDepartmentIds.map(String).filter(Boolean)
          : [],
        delegationTemplateId: 'product',
      },
      {
        organizationId,
        creatorUserId,
        scopeLabel,
      }
    );

    // Best-effort metadata for FE after navigate (localStorage keyed by projectId).
    payload._wizardMeta = {
      enabledWorkTypes,
      enabledViews,
      sampleWorkItems: Boolean(form.sampleWorkItems),
    };

    return { payload, workflowTemplateKey, methodology, wizardMeta: payload._wizardMeta };
  }, [form, organizationId, creatorUserId, scopeLabel]);

  const seedSampleCards = useCallback(
    async (boardId, projectId) => {
      if (!boardId || !form.sampleWorkItems) return;
      const silent = {
        organizationId,
        skipGlobalErrorHandling: true,
        skipPermissionDeniedToast: true,
        skipNotFoundToast: true,
      };
      let listId = '';
      try {
        const detailRes = await taskAPI.getBoardDetail(boardId, silent);
        const detail = unwrapTaskBoardDetailPayload(detailRes) || unwrap(detailRes);
        const lists = Array.isArray(detail?.lists) ? detail.lists : [];
        listId = String(lists[0]?._id || lists[0]?.id || '').trim();
      } catch {
        return;
      }
      if (!listId) return;
      const types = Object.entries(form.workTypes || {})
        .filter(([key, on]) => on && ['task', 'bug', 'story'].includes(key))
        .map(([key]) => key);
      const pick = types.length ? types : ['task'];
      try {
        for (let i = 0; i < Math.min(2, pick.length); i += 1) {
          await taskAPI.createBoardCard(
            boardId,
            {
              title: `Sample ${pick[i]} ${i + 1}`,
              issueType: pick[i],
              organizationId,
              projectId,
              listId,
            },
            silent
          );
        }
      } catch (_) {
        /* soft-fail */
      }
    },
    [form.sampleWorkItems, form.workTypes, organizationId]
  );

  const submit = useCallback(async () => {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return null;
    if (!organizationId || busy) return null;
    setBusy(true);
    try {
      const { payload, workflowTemplateKey, wizardMeta } = buildPayload();
      const { _wizardMeta, ...createBody } = payload;
      void _wizardMeta;
      const res = await projectAPI.create(createBody);
      const created = unwrap(res);
      const boardId = String(created?.defaultBoardId || created?.board?._id || '').trim();
      const projectId = String(created?._id || created?.projectId || '').trim();

      if (projectId && workflowTemplateKey) {
        try {
          await taskAPI.applyProjectWorkflow(projectId, {
            organizationId,
            templateKey: workflowTemplateKey,
          });
        } catch (wfErr) {
          toast.error(
            resolveApiErrorMessage(wfErr, {
              t,
              fallback: t('adminTasks.wizardWorkflowApplyWarn'),
            })
          );
        }
      }

      if (projectId && wizardMeta) {
        try {
          localStorage.setItem(`vh.projectWizardMeta.${projectId}`, JSON.stringify(wizardMeta));
        } catch (_) {
          /* ignore */
        }
      }

      await seedSampleCards(boardId, projectId);

      toast.success(t('adminTasks.createSuccess'));
      const result = {
        ...created,
        _id: boardId || projectId,
        projectId,
        defaultBoardId: boardId,
        board: created?.board,
        wizardMeta,
      };
      onCreated?.(result);
      return result;
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.createFail') }));
      return null;
    } finally {
      setBusy(false);
    }
  }, [validateStep, organizationId, busy, buildPayload, onCreated, t, seedSampleCards]);

  return {
    steps: PROJECT_WIZARD_STEPS,
    step,
    stepId: PROJECT_WIZARD_STEPS[step],
    slideDir,
    form,
    patchForm,
    catalogRoles,
    busy,
    goNext,
    goBack,
    submit,
    addSeedMember,
    removeSeedMember,
    workflowMeta,
    previewColumns,
    setupPanel,
    setSetupPanel,
    defaultMemberRole: WIZARD_DEFAULT_MEMBER_ROLE,
    creatorUserId,
  };
}

export { emptyForm as __emptyWizardForm };
