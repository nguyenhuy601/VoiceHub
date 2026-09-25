import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { projectAPI, DEFAULT_PROJECT_ROLES } from '../../../services/api/projectAPI';
import { requirementAPI } from '../../../services/api/requirementAPI';
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
import {
  emptyIntakeFiles,
  buildIntakeUploadQueue,
  countIntakeFiles,
} from './projectWizardInputFiles';
import { mapProjectIntakeDraftToForm } from './mapProjectIntakeDraftToForm';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function emptyForm(initial = {}) {
  const title = String(initial.title || '');
  const explicitCode = String(initial.projectCode || '').trim();
  const category = PROJECT_CATEGORIES.includes(String(initial.category || '').toLowerCase())
    ? String(initial.category).toLowerCase()
    : 'internal';
  const analysisMode = ['manual', 'ai'].includes(String(initial.analysisMode || '').toLowerCase())
    ? String(initial.analysisMode).toLowerCase()
    : '';
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
    analysisMode,
    intakeFiles: initial.intakeFiles
      ? { ...emptyIntakeFiles(), ...initial.intakeFiles }
      : emptyIntakeFiles(),
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
  const [intakeBusy, setIntakeBusy] = useState(false);
  /** idle | parsing | autofilled | kept_manual — chip file ≠ autofill success */
  const [requirementIntakeStatus, setRequirementIntakeStatus] = useState('idle');
  /** Session from Customer Raw preview (optional link on intake-draft). */
  const [intakeImportSessionId, setIntakeImportSessionId] = useState('');

  useEffect(() => {
    setStep(0);
    setSlideDir('forward');
    setForm(emptyForm(initialValues || {}));
    setIntakeBusy(false);
    setRequirementIntakeStatus('idle');
    setIntakeImportSessionId('');
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

  const applyRequirementFile = useCallback(
    async (file) => {
      if (!file) {
        setRequirementIntakeStatus('idle');
        setIntakeImportSessionId('');
        return;
      }
      if (!organizationId) return;
      const name = String(file.name || '').toLowerCase();
      if (!name.endsWith('.xlsx')) {
        setRequirementIntakeStatus('kept_manual');
        setIntakeImportSessionId('');
        toast.error(
          t('adminTasks.wizardIntakeNeedXlsx') ||
            'Chọn file Customer Requirement Raw (.xlsx) để tự điền.'
        );
        return;
      }
      setIntakeBusy(true);
      setRequirementIntakeStatus('parsing');
      try {
        const res = await requirementAPI.previewImport(organizationId, file);
        const data = unwrap(res);
        const sessionId = String(data?.sessionId || '').trim();
        if (sessionId) setIntakeImportSessionId(sessionId);
        const templateType = String(data?.templateType || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const isCustomerRaw =
          templateType === 'customerraw' ||
          templateType === 'customerrequirementraw' ||
          templateType.endsWith('customerraw') ||
          templateType.includes('customerrequirementraw');
        if (!isCustomerRaw) {
          setRequirementIntakeStatus('kept_manual');
          toast.error(
            t('adminTasks.wizardIntakeNotCustomerRaw') ||
              'File không phải Customer Requirement Raw — giữ file, nhập tay các trường.'
          );
          return;
        }
        const draft = data?.projectIntakeDraft;
        if (!draft || typeof draft !== 'object') {
          setRequirementIntakeStatus('kept_manual');
          toast.error(
            t('adminTasks.wizardIntakeNoDraft') ||
              'Không đọc được thông tin từ file — nhập tay các trường.'
          );
          return;
        }
        setForm((prev) => {
          const partial = mapProjectIntakeDraftToForm(prev, draft);
          if (!Object.keys(partial).length) return prev;
          return { ...prev, ...partial };
        });
        setRequirementIntakeStatus('autofilled');
        toast.success(
          t('adminTasks.wizardIntakeAutofillOk') || 'Đã điền thông tin từ Customer Requirement Raw.'
        );
      } catch (error) {
        setRequirementIntakeStatus('kept_manual');
        setIntakeImportSessionId('');
        toast.error(
          resolveApiErrorMessage(error, {
            t,
            fallback:
              t('adminTasks.wizardIntakeAutofillFail') ||
              'Không tự điền được (thiếu quyền tạo dự án / import Customer Raw, hoặc file lỗi) — nhập tay vẫn được.',
          })
        );
      } finally {
        setIntakeBusy(false);
      }
    },
    [organizationId, t]
  );

  const validateIdentityAndRoster = useCallback(() => {
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
  }, [form, t]);

  const validateStep = useCallback(
    (stepIndex) => {
      const id = PROJECT_WIZARD_STEPS[stepIndex];
      if (id === 'intake') {
        if (!form.intakeFiles?.requirement) {
          toast.error(
            t('adminTasks.wizardNeedRequirementFile') || 'Tải Customer Requirement bắt buộc.'
          );
          return false;
        }
        return validateIdentityAndRoster();
      }
      if (id === 'mode') {
        const mode = String(form.analysisMode || '').toLowerCase();
        if (mode !== 'manual' && mode !== 'ai') {
          toast.error(t('adminTasks.wizardNeedMode') || 'Chọn Analysis Mode.');
          return false;
        }
        return true;
      }
      return true;
    },
    [form, t, validateIdentityAndRoster]
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
        analysisMode: form.analysisMode || 'manual',
      },
      { organizationId, creatorUserId, scopeLabel }
    );
    payload.deliveryPhase = 'requirement_analysis';
    return { payload };
  }, [form, organizationId, creatorUserId, scopeLabel]);

  const submit = useCallback(async () => {
    for (let i = 0; i < PROJECT_WIZARD_STEPS.length; i += 1) {
      if (!validateStep(i)) return null;
    }
    if (!organizationId || busy) return null;
    setBusy(true);
    try {
      const { payload } = buildPayload();
      const projectRes = await projectAPI.create(payload, { skipPermissionDeniedToast: true });
      const project = unwrap(projectRes);
      const projectId = String(project?._id || project?.projectId || project?.id || '').trim();
      const defaultBoardId = String(
        project?.defaultBoardId || project?.board?._id || project?.boardId || ''
      ).trim();
      if (!projectId) {
        toast.error(t('adminTasks.createFail') || 'Không tạo được dự án nháp.');
        return null;
      }

      const reqFile = form.intakeFiles?.requirement;
      const draftRes = await requirementAPI.createIntakeDraft(organizationId, {
        title: form.title,
        description: form.description || form.body || '',
        customerName: form.customerName,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        priority: form.priority || 'Medium',
        sourceFileName: reqFile?.name || '',
        importSessionId: intakeImportSessionId || undefined,
        analysisMode: form.analysisMode || 'manual',
        projectId,
      });
      const pack = unwrap(draftRes);
      const packId = String(pack?._id || pack?.id || '').trim();
      if (!packId) {
        toast.error(t('adminTasks.createFail') || 'Không tạo được requirement pack.');
        return { projectId, defaultBoardId, packId: '', project, _hitlIncomplete: true };
      }

      const queue = buildIntakeUploadQueue(form.intakeFiles);
      let failCount = 0;
      for (const item of queue) {
        try {
          await requirementAPI.uploadPackCustomerDocument(organizationId, packId, item.file, {
            docClass: item.docClass,
            notes: `wizard-intake:${item.group}`,
          });
        } catch {
          failCount += 1;
        }
      }
      if (failCount > 0) {
        toast.error(
          t('adminTasks.wizardUploadPartialFail', { n: failCount }) ||
            `${failCount} file tải lên thất bại — thử lại ở Customer Documents.`
        );
        return {
          projectId,
          defaultBoardId,
          packId,
          pack,
          project,
          _intakeUpload: { total: queue.length, failed: failCount },
          _hitlIncomplete: true,
        };
      }

      toast.success(
        t('adminTasks.wizardDraftProjectCreated') ||
          'Đã tạo dự án nháp (Phase 1) — tiếp tục Gate 1 / AI Planning.'
      );

      const counts = countIntakeFiles(form.intakeFiles);
      const result = {
        projectId,
        defaultBoardId,
        packId,
        pack,
        project,
        analysisMode: form.analysisMode || 'manual',
        _intakeUpload: { total: counts.total, failed: 0 },
      };
      onCreated?.(result);
      return result;
    } catch (error) {
      const status = Number(error?.status || error?.response?.status || 0);
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback:
            status === 403
              ? t('taskBoard.createProjectDenied')
              : t('adminTasks.createFail'),
        })
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [
    validateStep,
    organizationId,
    busy,
    onCreated,
    t,
    buildPayload,
    form.intakeFiles,
    form.analysisMode,
    form.title,
    form.description,
    form.body,
    form.customerName,
    form.startDate,
    form.dueDate,
    form.priority,
    intakeImportSessionId,
  ]);

  return {
    steps: PROJECT_WIZARD_STEPS,
    step,
    stepId: PROJECT_WIZARD_STEPS[step],
    slideDir,
    form,
    patchForm,
    catalogRoles,
    busy,
    intakeBusy,
    requirementIntakeStatus,
    applyRequirementFile,
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
