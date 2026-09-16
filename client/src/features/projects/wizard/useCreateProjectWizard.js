import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { projectAPI, DEFAULT_PROJECT_ROLES } from '../../../services/api/projectAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import {
  buildCreateBoardPayload,
  validateCreateProjectIdentity,
  PROJECT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_PRIORITIES,
} from '../../adminTasks/createProjectSeed';
import { buildProjectCodeBase } from '../../../utils/projectCodeGenerate';
import {
  PROJECT_WIZARD_STEPS,
  WIZARD_DEFAULT_MEMBER_ROLE,
  WIZARD_BA_ROLE,
  WIZARD_PO_ROLE,
  firstSeedMemberWithRole,
} from './projectWizardConstants';
import { isProjectDateRangeInvalid } from '../hub/projectHubUtils';
import {
  INTAKE_LEAD_ROLE_KEYS,
  emptyIntakeSlots,
  slotsToSeedMembers,
  intakeSlotsFromSeedMembers,
  intakeSlotFilled,
} from './projectWizardIntakeRoles';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function emptyForm(initial = {}) {
  const title = String(initial.title || '');
  const explicitCode = String(initial.projectCode || '').trim();
  const category = PROJECT_CATEGORIES.includes(String(initial.category || '').toLowerCase())
    ? String(initial.category).toLowerCase()
    : 'internal';
  return {
    title,
    description: String(initial.description || initial.body || ''),
    projectType: PROJECT_TYPES.includes(String(initial.projectType || '').toLowerCase())
      ? String(initial.projectType).toLowerCase()
      : 'software',
    category,
    priority: PROJECT_PRIORITIES.includes(String(initial.priority || '').toLowerCase())
      ? String(initial.priority).toLowerCase()
      : 'medium',
    projectCode: explicitCode || (title.trim() ? buildProjectCodeBase({ title }) : ''),
    projectCodeTouched: Boolean(explicitCode),
    seedMembers: Array.isArray(initial.seedMembers) ? initial.seedMembers : [],
    intakeSlots: initial.intakeSlots
      ? { ...emptyIntakeSlots(), ...initial.intakeSlots }
      : intakeSlotsFromSeedMembers(initial.seedMembers),
    participationScale: 'company',
    relatedDepartmentIds: [],
    visibility: initial.visibility === 'workspace' ? 'workspace' : 'private',
    dueDate: initial.dueDate ? String(initial.dueDate).slice(0, 10) : '',
    startDate: initial.startDate ? String(initial.startDate).slice(0, 10) : '',
    customerName: String(initial.customerName || initial.customer?.name || ''),
    customerCompany: String(initial.customerCompany || initial.customer?.company || ''),
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
  const [form, setForm] = useState(() => emptyForm(initialValues || {}));
  const [catalogRoles, setCatalogRoles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStep(0);
    setSlideDir('forward');
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

  const validateStep = useCallback(
    (stepIndex) => {
      const id = PROJECT_WIZARD_STEPS[stepIndex];
      if (id === 'identity') {
        const err = validateCreateProjectIdentity({
          title: form.title,
          category: form.category || 'internal',
          customerName: form.customerName,
        });
        if (err === 'title') {
          toast.error(t('adminTasks.createNeedTitle'));
          return false;
        }
        if (err === 'customer') {
          toast.error(t('adminTasks.wizardNeedCustomer') || 'Nhập tên khách hàng.');
          return false;
        }
        if (isProjectDateRangeInvalid(form.startDate, form.dueDate)) {
          toast.error(t('adminTasks.wizardProjectDateRangeInvalid'));
          return false;
        }
        return true;
      }
      if (id === 'roster') {
        const slots = { ...emptyIntakeSlots(), ...(form.intakeSlots || {}) };
        if (!intakeSlotFilled(slots, 'product_owner')) {
          toast.error(t('adminTasks.wizardNeedPo'));
          return false;
        }
        if (!intakeSlotFilled(slots, 'project_manager')) {
          toast.error(t('adminTasks.wizardNeedPm'));
          return false;
        }
        if (!intakeSlotFilled(slots, 'business_analyst')) {
          toast.error(t('adminTasks.wizardRosterNeedBa'));
          return false;
        }
        return true;
      }
      return true;
    },
    [form, t]
  );

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    setSlideDir('forward');
    setStep((s) => Math.min(s + 1, PROJECT_WIZARD_STEPS.length - 1));
  }, [step, validateStep]);

  const goBack = useCallback(() => {
    setSlideDir('back');
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const setIntakeSlot = useCallback((roleKey, candidate) => {
    const key = String(roleKey || '')
      .trim()
      .toLowerCase();
    if (!INTAKE_LEAD_ROLE_KEYS.includes(key)) return;
    setForm((prev) => {
      const slots = { ...emptyIntakeSlots(), ...(prev.intakeSlots || {}) };
      if (!candidate) {
        slots[key] = null;
      } else {
        const userId = String(candidate.userId || '').trim();
        if (!userId) return prev;
        slots[key] = {
          userId,
          displayName: String(candidate.displayName || '').trim(),
          jobTitle: String(candidate.jobTitle || '').trim(),
        };
      }
      return {
        ...prev,
        intakeSlots: slots,
        seedMembers: slotsToSeedMembers(slots),
        relatedDepartmentIds: [],
      };
    });
  }, []);

  const clearIntakeSlot = useCallback(
    (roleKey) => {
      setIntakeSlot(roleKey, null);
    },
    [setIntakeSlot]
  );

  const addSeedMember = useCallback((rowOrUserId, projectRoleKeys) => {
    setForm((prev) => {
      const fromString = typeof rowOrUserId === 'string' || typeof rowOrUserId === 'number';
      const userId = fromString
        ? String(rowOrUserId || '').trim()
        : String(rowOrUserId?.userId || '').trim();
      if (!userId) return prev;
      const keys = Array.isArray(projectRoleKeys)
        ? projectRoleKeys
        : Array.isArray(rowOrUserId?.projectRoleKeys)
          ? rowOrUserId.projectRoleKeys
          : [];
      const projectRoleKeysNorm = [
        ...new Set(keys.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)),
      ];
      if (!projectRoleKeysNorm.length) return prev;
      const rest = (prev.seedMembers || []).filter((m) => String(m.userId) !== userId);
      const displayName = fromString ? '' : String(rowOrUserId?.displayName || '').trim();
      const seedMembers = [
        ...rest,
        {
          userId,
          projectRoleKeys: projectRoleKeysNorm,
          ...(displayName ? { displayName } : {}),
        },
      ];
      return {
        ...prev,
        seedMembers,
        intakeSlots: intakeSlotsFromSeedMembers(seedMembers),
      };
    });
  }, []);

  const removeSeedMember = useCallback((userId) => {
    const id = String(userId || '').trim();
    setForm((prev) => {
      const slots = { ...emptyIntakeSlots(), ...(prev.intakeSlots || {}) };
      for (const key of INTAKE_LEAD_ROLE_KEYS) {
        if (String(slots[key]?.userId || '') === id) slots[key] = null;
      }
      return {
        ...prev,
        intakeSlots: slots,
        seedMembers: slotsToSeedMembers(slots),
      };
    });
  }, []);

  const buildPayload = useCallback(() => {
    const pm = firstSeedMemberWithRole(form.seedMembers, 'project_manager');
    const payload = buildCreateBoardPayload(
      {
        ...form,
        methodology: 'kanban',
        members: slotsToSeedMembers({ ...emptyIntakeSlots(), ...(form.intakeSlots || {}) }),
        relatedDepartmentIds: [],
        projectManagerId: pm?.userId,
      },
      { organizationId, creatorUserId, scopeLabel }
    );
    payload.deliveryPhase = 'requirement_analysis';
    return { payload };
  }, [form, organizationId, creatorUserId, scopeLabel]);

  const submit = useCallback(async () => {
    if (!validateStep(0) || !validateStep(1)) return null;
    if (!organizationId || busy) return null;
    setBusy(true);
    try {
      const { payload } = buildPayload();
      const res = await projectAPI.create(payload);
      const created = unwrap(res);
      const boardId = String(created?.defaultBoardId || created?.board?._id || '').trim();
      const projectId = String(created?._id || created?.projectId || '').trim();

      toast.success(t('adminTasks.createSuccess'));
      const result = {
        ...created,
        _id: projectId,
        projectId,
        defaultBoardId: boardId,
        board: created?.board,
        deliveryPhase: created?.deliveryPhase || 'requirement_analysis',
      };
      onCreated?.(result);
      return result;
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.createFail') }));
      return null;
    } finally {
      setBusy(false);
    }
  }, [validateStep, organizationId, busy, buildPayload, onCreated, t]);

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
    setIntakeSlot,
    clearIntakeSlot,
    defaultMemberRole: WIZARD_DEFAULT_MEMBER_ROLE,
    baRole: WIZARD_BA_ROLE,
    poRole: WIZARD_PO_ROLE,
    creatorUserId,
    setupPanel: '',
    setSetupPanel: () => {},
    previewColumns: [],
    workflowMeta: { methodology: 'kanban' },
  };
}

export { emptyForm as __emptyWizardForm };
