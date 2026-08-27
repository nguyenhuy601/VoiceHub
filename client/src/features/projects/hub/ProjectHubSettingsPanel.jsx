import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { projectAPI } from '../../../services/api/projectAPI';
import { organizationAPI } from '../../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { repairUtf8Mojibake } from '../../../utils/utf8Mojibake';
import { flattenOrgStructureDepartments } from '../../../utils/orgMemberStructureScope';
import { toDateInputValue, isProjectDateRangeInvalid } from './projectHubUtils';
import ProjectHubSettingsPopover from './ProjectHubSettingsPopover';
import ProjectHubWorkTypeHierarchy from './ProjectHubWorkTypeHierarchy';
import ProjectHubDelegationSection from './ProjectHubDelegationSection';
import CatalogKeyLabelEditor from './CatalogKeyLabelEditor';
import { normalizePriorityConfig } from './projectPriorityConfig';
import {
  ensureAdjacentTransitions,
  ensureReopenFromDone,
  filterTransitionsByStateKeys,
  mergeEditorItemsToStates,
  statesToEditorItems,
} from './workflowStatusEditor';
import {
  PROJECT_CATEGORIES,
  PROJECT_METHODOLOGIES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
} from '../../adminTasks/createProjectSeed';

/** Status DA có thể sửa trên Hub Settings — không gồm closed (dùng luồng Complete). */
const PROFILE_EDITABLE_STATUSES = Object.freeze([
  'planning',
  'ready_for_planning',
  'in_development',
  'on_hold',
]);

const SPRINT_WEEKDAYS = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

function tagsToInputValue(tags) {
  if (Array.isArray(tags)) {
    return tags.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  }
  return String(tags || '').trim();
}

function parseTagsInput(raw) {
  return [
    ...new Set(
      String(raw || '')
        .split(',')
        .map((x) => String(x || '').trim().slice(0, 48))
        .filter(Boolean)
    ),
  ].slice(0, 20);
}

const VIS_AUDIENCES = [
  { key: 'system_admins', locked: true },
  { key: 'organization_admins' },
  { key: 'directors' },
  { key: 'project_managers' },
  { key: 'project_members' },
  { key: 'related_department_managers' },
  { key: 'related_department_members' },
  { key: 'all_employees' },
];

const VIS_LEVELS = ['summary', 'details', 'confidential'];

/** Preset nền board (gradient + solid) — cùng hướng CreateTaskBoardModal. */
const BOARD_BACKGROUND_PRESETS = [
  'linear-gradient(135deg,#1f2937,#111827)',
  'linear-gradient(135deg,#7c2d12,#1f2937)',
  'linear-gradient(135deg,#0f766e,#1e293b)',
  'linear-gradient(135deg,#312e81,#1e1b4b)',
  'linear-gradient(135deg,#7e22ce,#1f2937)',
  '#0f172a',
  '#1e3a5f',
  '#14532d',
  '#7c2d12',
  '#4c1d95',
];

function isHexColor(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
}

function normalizeHexForPicker(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#0f172a';
}

function defaultVisibilityPolicy() {
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

function normalizeVisibilityPolicy(raw) {
  const base = defaultVisibilityPolicy();
  if (!raw || typeof raw !== 'object') return base;
  return {
    discoverAudiences: {
      ...base.discoverAudiences,
      ...(raw.discoverAudiences && typeof raw.discoverAudiences === 'object'
        ? raw.discoverAudiences
        : {}),
    },
    defaultInformationLevels: {
      ...base.defaultInformationLevels,
      ...(raw.defaultInformationLevels && typeof raw.defaultInformationLevels === 'object'
        ? raw.defaultInformationLevels
        : {}),
    },
    allowProjectManagerOverride:
      raw.allowProjectManagerOverride === undefined
        ? base.allowProjectManagerOverride
        : Boolean(raw.allowProjectManagerOverride),
  };
}

/**
 * Settings dự án — danh sách nhóm, mỗi nhóm mở popover.
 */
export default function ProjectHubSettingsPanel({
  projectId = '',
  boardId = '',
  board = null,
  projectPayload = null,
  organizationId = '',
  apiCtx = null,
  canManage = false,
  canManageDelivery = false,
  isDarkMode = false,
  onSaved,
  workTypeConfig: serverWorkTypeConfig = null,
  priorityConfig: serverPriorityConfig = null,
}) {
  const { t } = useAppStrings();
  const [title, setTitle] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [visibilityMode, setVisibilityMode] = useState('inherit');
  const [visibilityPolicy, setVisibilityPolicy] = useState(defaultVisibilityPolicy);
  const [relatedDepartmentIds, setRelatedDepartmentIds] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [orgPolicySeed, setOrgPolicySeed] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [background, setBackground] = useState('');
  const [projectType, setProjectType] = useState('software');
  const [category, setCategory] = useState('internal');
  const [projectPriority, setProjectPriority] = useState('medium');
  const [projectStatus, setProjectStatus] = useState('ready_for_planning');
  const [tagsInput, setTagsInput] = useState('');
  const [estimatedDurationDays, setEstimatedDurationDays] = useState('');
  const [workingCalendar, setWorkingCalendar] = useState('standard');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerContractCode, setCustomerContractCode] = useState('');
  const [methodology, setMethodology] = useState('kanban');
  const [sprintDurationDays, setSprintDurationDays] = useState('14');
  const [sprintStartDay, setSprintStartDay] = useState('monday');
  const [wipLimit, setWipLimit] = useState('0');
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [requiredProjectRoles, setRequiredProjectRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [workflowTemplateId, setWorkflowTemplateId] = useState('');
  const [applyingWorkflow, setApplyingWorkflow] = useState(false);
  const [approvalPolicies, setApprovalPolicies] = useState([]);
  const [taskDonePolicyId, setTaskDonePolicyId] = useState('');
  const [crApprovalPolicyId, setCrApprovalPolicyId] = useState('');
  const [bindingApproval, setBindingApproval] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [catalogToken, setCatalogToken] = useState(0);
  const [workflowDoc, setWorkflowDoc] = useState(null);
  const [workflowStates, setWorkflowStates] = useState([]);
  const [priorityItems, setPriorityItems] = useState(() => normalizePriorityConfig(null).items);

  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  /** Hint / phụ đề — đủ sáng trên nền tối (tránh slate-400 quá mờ). */
  const muted = isDarkMode ? 'text-slate-300' : 'text-muted-foreground';
  const fieldLabelCls = `block text-xs font-semibold ${titleCls}`;
  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';

  const resolvedProjectId = String(projectId || board?.projectId || '').trim();

  useEffect(() => {
    const src = projectPayload || board || {};
    setTitle(String(src.title || board?.title || ''));
    setProjectCode(String(src.projectCode || board?.projectCode || ''));
    setDescription(String(src.description || board?.description || ''));
    setVisibility(
      (src.visibility || board?.visibility) === 'workspace' ? 'workspace' : 'private'
    );
    setVisibilityMode(
      (src.visibilityMode || board?.visibilityMode) === 'custom' ? 'custom' : 'inherit'
    );
    setVisibilityPolicy(
      normalizeVisibilityPolicy(src.visibilityPolicy || board?.visibilityPolicy)
    );
    const related =
      Array.isArray(src.relatedDepartmentIds) && src.relatedDepartmentIds.length
        ? src.relatedDepartmentIds
        : Array.isArray(board?.relatedDepartmentIds)
          ? board.relatedDepartmentIds
          : [];
    setRelatedDepartmentIds(related.map(String));
    setDueDate(
      toDateInputValue(src.dueDate || src.expectedEndDate || board?.dueDate || board?.expectedEndDate)
    );
    setStartDate(toDateInputValue(src.startDate || board?.startDate));
    setBackground(String(src.background || board?.background || ''));
    setRequiredProjectRoles(
      Array.isArray(src.requiredProjectRoles)
        ? src.requiredProjectRoles
        : Array.isArray(board?.requiredProjectRoles)
          ? board.requiredProjectRoles
          : []
    );
    setWorkflowTemplateId(
      String(src.workflowTemplateId || board?.workflowTemplateId || '').trim()
    );
    setTaskDonePolicyId(
      String(
        src.defaultTaskDoneApprovalPolicyId || board?.defaultTaskDoneApprovalPolicyId || ''
      ).trim()
    );
    setCrApprovalPolicyId(
      String(
        src.changeRequestApprovalPolicyId || board?.changeRequestApprovalPolicyId || ''
      ).trim()
    );
    setPriorityItems(
      normalizePriorityConfig(
        serverPriorityConfig || src.priorityConfig || board?.priorityConfig
      ).items
    );

    const nextType = String(src.projectType || 'software').trim().toLowerCase();
    setProjectType(PROJECT_TYPES.includes(nextType) ? nextType : 'software');
    const nextCategory = String(src.category || 'internal').trim().toLowerCase();
    setCategory(PROJECT_CATEGORIES.includes(nextCategory) ? nextCategory : 'internal');
    const nextPriority = String(src.priority || 'medium').trim().toLowerCase();
    setProjectPriority(PROJECT_PRIORITIES.includes(nextPriority) ? nextPriority : 'medium');
    const nextStatus = String(src.status || 'ready_for_planning').trim().toLowerCase();
    setProjectStatus(
      PROFILE_EDITABLE_STATUSES.includes(nextStatus) ? nextStatus : 'ready_for_planning'
    );
    setTagsInput(tagsToInputValue(src.tags));
    const duration = src.estimatedDurationDays;
    setEstimatedDurationDays(
      duration === null || duration === undefined || duration === '' ? '' : String(duration)
    );
    setWorkingCalendar(String(src.workingCalendar || 'standard').trim() || 'standard');
    const customer = src.customer && typeof src.customer === 'object' ? src.customer : {};
    setCustomerName(String(customer.name || '').trim());
    setCustomerCompany(String(customer.company || '').trim());
    setCustomerContact(String(customer.contactPerson || '').trim());
    setCustomerContractCode(String(customer.contractCode || '').trim());

    const nextMethodology = String(src.methodology || 'kanban').trim().toLowerCase();
    setMethodology(PROJECT_METHODOLOGIES.includes(nextMethodology) ? nextMethodology : 'kanban');
    const methodSettings =
      src.methodologySettings && typeof src.methodologySettings === 'object'
        ? src.methodologySettings
        : {};
    const sprintDays =
      methodSettings.sprintDurationDays ?? src.sprintDurationDays ?? 14;
    setSprintDurationDays(
      sprintDays === null || sprintDays === undefined || sprintDays === ''
        ? '14'
        : String(sprintDays)
    );
    const startDay = String(methodSettings.sprintStartDay || src.sprintStartDay || 'monday')
      .trim()
      .toLowerCase();
    setSprintStartDay(SPRINT_WEEKDAYS.includes(startDay) ? startDay : 'monday');
    const wip = methodSettings.wipLimit ?? src.wipLimit ?? 0;
    setWipLimit(wip === null || wip === undefined || wip === '' ? '0' : String(wip));
  }, [board, projectPayload, serverPriorityConfig]);

  const resolvedOrganizationId = String(organizationId || board?.organizationId || '').trim();

  useEffect(() => {
    if (!canManage || !resolvedOrganizationId) {
      setRoleCatalog([]);
      setDepartments([]);
      setOrgPolicySeed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRolesLoading(true);
      try {
        const catalogOpts = resolvedProjectId ? { projectId: resolvedProjectId } : {};
        const [rolesRes, structureRes, wfRes, apRes, orgVisRes] = await Promise.all([
          projectAPI.listRoleCatalog(resolvedOrganizationId),
          organizationAPI.getStructure(resolvedOrganizationId).catch(() => null),
          taskAPI.listWorkflowTemplates(resolvedOrganizationId, catalogOpts).catch(() => null),
          projectAPI.listApprovalPolicies(resolvedOrganizationId, catalogOpts).catch(() => null),
          organizationAPI.getProjectVisibilityPolicy(resolvedOrganizationId).catch(() => null),
        ]);
        const data = rolesRes?.data?.data ?? rolesRes?.data ?? rolesRes;
        const structure = structureRes?.data?.data ?? structureRes?.data ?? structureRes;
        const wf = wfRes?.data?.data ?? wfRes?.data ?? wfRes;
        const ap = apRes?.data?.data ?? apRes?.data ?? apRes;
        const orgVis = orgVisRes?.data?.data ?? orgVisRes?.data ?? orgVisRes;
        const flatDepts = flattenOrgStructureDepartments(structure);
        const flatIds = new Set(flatDepts.map((d) => String(d._id || d.id || '')));
        const topLevel = Array.isArray(structure?.departments) ? structure.departments : [];
        for (const d of topLevel) {
          const id = String(d._id || d.id || '');
          if (id && !flatIds.has(id)) flatDepts.push(d);
        }
        if (!cancelled) {
          setRoleCatalog(Array.isArray(data) ? data : []);
          setDepartments(flatDepts);
          setWorkflowTemplates(Array.isArray(wf) ? wf : []);
          setApprovalPolicies(Array.isArray(ap) ? ap : []);
          if (orgVis?.policy) setOrgPolicySeed(normalizeVisibilityPolicy(orgVis.policy));
        }
      } catch {
        if (!cancelled) {
          setRoleCatalog([]);
          setDepartments([]);
          setWorkflowTemplates([]);
          setApprovalPolicies([]);
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, resolvedOrganizationId, resolvedProjectId, catalogToken]);

  useEffect(() => {
    if (!canManage || !boardId) {
      setWorkflowDoc(null);
      setWorkflowStates([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardWorkflow(boardId, apiCtx || { organizationId: resolvedOrganizationId });
        const wf = unwrapTaskApiPayload(res) ?? res?.data?.data ?? res?.data ?? res;
        if (cancelled) return;
        setWorkflowDoc(wf && typeof wf === 'object' ? wf : null);
        setWorkflowStates(
          Array.isArray(wf?.states)
            ? wf.states.map((s) => ({
                ...s,
                label: repairUtf8Mojibake(s?.label),
              }))
            : []
        );
      } catch {
        if (!cancelled) {
          setWorkflowDoc(null);
          setWorkflowStates([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, boardId, apiCtx, resolvedOrganizationId]);

  const onVisibilityModeChange = (nextMode) => {
    const mode = nextMode === 'custom' ? 'custom' : 'inherit';
    setVisibilityMode(mode);
    if (mode === 'custom') {
      const hasSaved =
        board?.visibilityPolicy &&
        typeof board.visibilityPolicy === 'object' &&
        Object.keys(board.visibilityPolicy.discoverAudiences || {}).length > 0;
      if (!hasSaved) {
        setVisibilityPolicy(normalizeVisibilityPolicy(orgPolicySeed || defaultVisibilityPolicy()));
      }
    }
  };

  const setDiscoverAudience = (key, checked) => {
    if (key === 'system_admins') return;
    setVisibilityPolicy((prev) => ({
      ...prev,
      discoverAudiences: { ...prev.discoverAudiences, [key]: Boolean(checked) },
    }));
  };

  const setAudienceLevel = (key, level) => {
    setVisibilityPolicy((prev) => ({
      ...prev,
      defaultInformationLevels: { ...prev.defaultInformationLevels, [key]: level },
    }));
  };

  const setAllowProjectManagerOverride = (checked) => {
    setVisibilityPolicy((prev) => ({
      ...prev,
      allowProjectManagerOverride: Boolean(checked),
    }));
  };

  const assignableRoles = useMemo(
    () => roleCatalog.filter((role) => role?.canAssign !== false),
    [roleCatalog]
  );

  const staffingCountByKey = useMemo(() => {
    const map = new Map();
    for (const row of requiredProjectRoles || []) {
      const key = String(row?.roleKey || '').trim();
      if (!key) continue;
      map.set(key, Number(row?.requiredCount) || 0);
    }
    return map;
  }, [requiredProjectRoles]);

  const setRequiredRoleCount = (roleKey, nextValue) => {
    const key = String(roleKey || '').trim();
    if (!key) return;
    const parsed = Number(nextValue);
    const requiredCount = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    setRequiredProjectRoles((prev) => {
      const rows = Array.isArray(prev) ? [...prev] : [];
      const next = rows.filter((row) => String(row?.roleKey || '').trim() !== key);
      if (requiredCount > 0) next.push({ roleKey: key, requiredCount });
      return next;
    });
  };

  const closePopover = useCallback(() => setOpenSection(null), []);

  /** Hồ sơ DA chỉ an toàn khi đã hydrate từ GET project (tránh PATCH default ghi đè). */
  const profileHydrated = Boolean(!resolvedProjectId || projectPayload);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!canManage || saving || !title.trim()) return;
    if (openSection === 'profile' && !profileHydrated) {
      toast.error(t('workspace.projectHubSettingsCatalogLoading'));
      return;
    }
    if (openSection === 'workflow' && !profileHydrated) {
      toast.error(t('workspace.projectHubSettingsCatalogLoading'));
      return;
    }
    if (isProjectDateRangeInvalid(startDate, dueDate)) {
      toast.error(t('workspace.projectHubDateRangeInvalid'));
      return;
    }
    if (category === 'customer' && !customerName.trim()) {
      toast.error(t('workspace.projectHubProfileCustomerNameRequired'));
      return;
    }
    const id = resolvedProjectId || String(boardId || '').trim();
    if (!id) return;
    setSaving(true);
    try {
      const endValue = dueDate || null;
      const durationRaw = String(estimatedDurationDays || '').trim();
      let durationValue = null;
      if (durationRaw !== '') {
        const n = Number(durationRaw);
        if (!Number.isFinite(n) || n < 0 || n > 3650) {
          toast.error(t('workspace.projectHubProfileDurationInvalid'));
          setSaving(false);
          return;
        }
        durationValue = Math.round(n);
      }
      const body = {
        title: title.trim(),
        projectCode: projectCode.trim(),
        description,
        visibility,
        visibilityMode,
        relatedDepartmentIds,
        startDate: startDate || null,
        dueDate: endValue,
        expectedEndDate: endValue,
        background,
        requiredProjectRoles,
      };
      if (resolvedProjectId) {
        body.projectType = projectType;
        body.category = category;
        body.priority = projectPriority;
        body.status = projectStatus;
        body.tags = parseTagsInput(tagsInput);
        body.estimatedDurationDays = durationValue;
        body.workingCalendar = String(workingCalendar || 'standard').trim() || 'standard';
        body.customer =
          category === 'customer'
            ? {
                name: customerName.trim(),
                company: customerCompany.trim(),
                contactPerson: customerContact.trim(),
                contractCode: customerContractCode.trim(),
              }
            : null;
        body.methodology = methodology;
        if (methodology === 'scrum') {
          const days = Number(sprintDurationDays);
          if (!Number.isFinite(days) || days < 1 || days > 60) {
            toast.error(t('workspace.projectHubWorkflowSprintDaysInvalid'));
            setSaving(false);
            return;
          }
          body.sprintDurationDays = Math.round(days);
          body.sprintStartDay = SPRINT_WEEKDAYS.includes(sprintStartDay)
            ? sprintStartDay
            : 'monday';
        }
        if (methodology === 'kanban') {
          const wip = Number(wipLimit);
          if (!Number.isFinite(wip) || wip < 0 || wip > 500) {
            toast.error(t('workspace.projectHubWorkflowWipInvalid'));
            setSaving(false);
            return;
          }
          body.wipLimit = Math.round(wip);
        }
      }
      if (visibilityMode === 'custom') {
        body.visibilityPolicy = visibilityPolicy;
      }
      if (resolvedProjectId) {
        await projectAPI.patch(resolvedProjectId, {
          ...body,
          priorityConfig: { items: priorityItems },
        });
        await projectAPI.bindProjectApprovalPolicy(
          resolvedProjectId,
          taskDonePolicyId || null,
          { changeRequestPolicyId: crApprovalPolicyId || null }
        );
      } else {
        const opts = apiCtx || { organizationId };
        await taskAPI.patchBoard(boardId, body, opts);
      }
      if (boardId && workflowDoc && workflowStates.length) {
        const transitions = ensureReopenFromDone(
          ensureAdjacentTransitions(
            filterTransitionsByStateKeys(workflowDoc.transitions, workflowStates),
            workflowStates
          ),
          workflowStates
        );
        await taskAPI.putBoardWorkflow(
          boardId,
          {
            name: workflowDoc.name || 'Default',
            states: workflowStates.map((s) => ({
              ...s,
              label: repairUtf8Mojibake(s?.label),
            })),
            transitions,
            templateKey: workflowDoc.templateKey,
            templateId: workflowDoc.templateId,
          },
          apiCtx || { organizationId: resolvedOrganizationId }
        );
      }
      toast.success(t('workspace.projectHubSettingsSaved'));
      onSaved?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubSettingsSaveFail') })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="px-4 py-8 text-center sm:px-6">
        <p className={`text-sm ${muted}`}>{t('workspace.projectHubSettingsDenied')}</p>
      </div>
    );
  }

  const chipRowCls =
    'mt-2 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-border/80 bg-background/40 p-2 sm:grid-cols-2';

  const groups = [
    { id: 'identity', title: t('workspace.projectHubSettingsIdentityTitle'), hint: t('workspace.projectHubSettingsGroupIdentityHint') },
    { id: 'profile', title: t('workspace.projectHubSettingsProfileTitle'), hint: t('workspace.projectHubSettingsProfileHint') },
    { id: 'visibility', title: t('workspace.projectHubSettingsGroupVisibilityTitle'), hint: t('workspace.projectHubSettingsGroupVisibilityHint') },
    { id: 'staffing', title: t('workspace.projectHubSettingsStaffingTitle'), hint: t('workspace.projectHubSettingsGroupStaffingHint') },
    { id: 'workflow', title: t('workspace.projectHubWorkflowTitle'), hint: t('workspace.projectHubSettingsGroupWorkflowHint') },
    { id: 'statusPriority', title: t('workspace.projectHubSettingsStatusPriorityTitle'), hint: t('workspace.projectHubSettingsStatusPriorityHint') },
    { id: 'approval', title: t('workspace.projectHubApprovalTitle'), hint: t('workspace.projectHubSettingsGroupApprovalHint') },
    { id: 'workTypes', title: t('workspace.projectHubSettingsWorkTypesTitle'), hint: t('workspace.projectHubSettingsWorkTypesIndexHint') },
    ...(canManageDelivery && String(boardId || '').trim()
      ? [
          {
            id: 'delegation',
            title: t('workspace.projectHubDelegationTitle'),
            hint: t('workspace.projectHubDelegationGroupHint'),
          },
        ]
      : []),
  ];

  const saveFooter = (
    <>
      <button
        type="button"
        onClick={closePopover}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground"
      >
        {t('workspace.projectHubSettingsClose')}
      </button>
      <button
        type="button"
        disabled={
          saving ||
          !title.trim() ||
          (openSection === 'profile' && !profileHydrated) ||
          (openSection === 'workflow' && !profileHydrated)
        }
        onClick={() => handleSave()}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? '…' : t('workspace.projectHubSettingsSave')}
      </button>
    </>
  );

  const closeOnlyFooter = (
    <button
      type="button"
      onClick={closePopover}
      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
    >
      {t('workspace.projectHubSettingsClose')}
    </button>
  );

  const identityBody = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={`${fieldLabelCls} sm:col-span-2`}>
        {t('workspace.projectHubFieldTitle')}
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className={`${fieldLabelCls} sm:col-span-2`}>
        {t('workspace.projectHubFieldCode')}
        <input className={inputCls} value={projectCode} onChange={(e) => setProjectCode(e.target.value)} />
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldStart')}
        <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldDue')}
        <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      {isProjectDateRangeInvalid(startDate, dueDate) ? (
        <p className="text-sm text-destructive sm:col-span-2" role="alert">
          {t('workspace.projectHubDateRangeInvalid')}
        </p>
      ) : null}
      <label className={`${fieldLabelCls} sm:col-span-2`}>
        {t('workspace.projectHubFieldDescription')}
        <textarea className={`${inputCls} min-h-[72px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className={`${fieldLabelCls} sm:col-span-2`}>
        <span>{t('workspace.projectHubFieldBackground')}</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {BOARD_BACKGROUND_PRESETS.map((preset) => {
            const selected = background === preset;
            return (
              <button
                key={preset}
                type="button"
                title={preset}
                aria-label={preset}
                aria-pressed={selected}
                onClick={() => setBackground(preset)}
                className={`h-9 w-9 shrink-0 rounded-lg border-2 shadow-inner transition ${
                  selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                }`}
                style={{ background: preset }}
              />
            );
          })}
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs font-medium text-foreground">
            <input
              type="color"
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              value={normalizeHexForPicker(background)}
              onChange={(e) => setBackground(e.target.value)}
              aria-label={t('workspace.projectHubBackgroundPickColor')}
            />
            <span className={muted}>{t('workspace.projectHubBackgroundPickColor')}</span>
          </label>
        </div>
      </div>
    </div>
  );

  const profileBody = (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className={`text-xs leading-relaxed sm:col-span-2 ${muted}`}>
        {t('workspace.projectHubSettingsProfileBodyHint')}
      </p>
      {!profileHydrated ? (
        <p className={`text-xs sm:col-span-2 ${muted}`} role="status">
          {t('workspace.projectHubSettingsCatalogLoading')}
        </p>
      ) : null}
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldProjectType')}
        <select
          className={inputCls}
          value={projectType}
          disabled={!profileHydrated || saving}
          onChange={(e) => setProjectType(e.target.value)}
        >
          {PROJECT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`workspace.projectHubProjectType_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldCategory')}
        <select
          className={inputCls}
          value={category}
          disabled={!profileHydrated || saving}
          onChange={(e) => setCategory(e.target.value)}
        >
          {PROJECT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`workspace.projectHubCategory_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldProjectPriority')}
        <select
          className={inputCls}
          value={projectPriority}
          disabled={!profileHydrated || saving}
          onChange={(e) => setProjectPriority(e.target.value)}
        >
          {PROJECT_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`workspace.projectHubProjectPriority_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldProjectStatus')}
        <select
          className={inputCls}
          value={projectStatus}
          disabled={!profileHydrated || saving}
          onChange={(e) => setProjectStatus(e.target.value)}
        >
          {PROFILE_EDITABLE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`workspace.projectHubProjectStatus_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldEstimatedDuration')}
        <input
          type="number"
          min="0"
          max="3650"
          step="1"
          className={inputCls}
          value={estimatedDurationDays}
          disabled={!profileHydrated || saving}
          onChange={(e) => setEstimatedDurationDays(e.target.value)}
          placeholder="—"
        />
      </label>
      <label className={fieldLabelCls}>
        {t('workspace.projectHubFieldWorkingCalendar')}
        <input
          className={inputCls}
          value={workingCalendar}
          disabled={!profileHydrated || saving}
          onChange={(e) => setWorkingCalendar(e.target.value)}
        />
      </label>
      <label className={`${fieldLabelCls} sm:col-span-2`}>
        {t('workspace.projectHubFieldTags')}
        <input
          className={inputCls}
          value={tagsInput}
          disabled={!profileHydrated || saving}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder={t('workspace.projectHubFieldTagsPlaceholder')}
        />
        <span className={`mt-1 block text-[11px] font-normal ${muted}`}>
          {t('workspace.projectHubFieldTagsHint')}
        </span>
      </label>
      {category === 'customer' ? (
        <div className="grid gap-3 rounded-lg border border-border/80 bg-background/40 p-3 sm:col-span-2 sm:grid-cols-2">
          <p className={`text-xs font-semibold sm:col-span-2 ${titleCls}`}>
            {t('workspace.projectHubProfileCustomerTitle')}
          </p>
          <label className={`${fieldLabelCls} sm:col-span-2`}>
            {t('workspace.projectHubFieldCustomerName')}
            <input
              className={inputCls}
              value={customerName}
              disabled={!profileHydrated || saving}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </label>
          <label className={fieldLabelCls}>
            {t('workspace.projectHubFieldCustomerCompany')}
            <input
              className={inputCls}
              value={customerCompany}
              disabled={!profileHydrated || saving}
              onChange={(e) => setCustomerCompany(e.target.value)}
            />
          </label>
          <label className={fieldLabelCls}>
            {t('workspace.projectHubFieldCustomerContact')}
            <input
              className={inputCls}
              value={customerContact}
              disabled={!profileHydrated || saving}
              onChange={(e) => setCustomerContact(e.target.value)}
            />
          </label>
          <label className={`${fieldLabelCls} sm:col-span-2`}>
            {t('workspace.projectHubFieldCustomerContract')}
            <input
              className={inputCls}
              value={customerContractCode}
              disabled={!profileHydrated || saving}
              onChange={(e) => setCustomerContractCode(e.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );

  const visibilityBody = (
    <div>
      <p className={`text-xs leading-relaxed ${muted}`}>
        {visibilityMode === 'custom'
          ? t('workspace.projectHubVisCustomHint')
          : t('workspace.projectHubVisInheritHint')}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={fieldLabelCls}>
          {t('workspace.projectHubFieldVisibilityMode')}
          <select className={inputCls} value={visibilityMode} onChange={(e) => onVisibilityModeChange(e.target.value)}>
            <option value="inherit">{t('workspace.projectHubVisInherit')}</option>
            <option value="custom">{t('workspace.projectHubVisCustom')}</option>
          </select>
        </label>
        <label className={fieldLabelCls}>
          {t('workspace.projectHubFieldVisibility')}
          <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="private">{t('workspace.projectHubVisibilityPrivate')}</option>
            <option value="workspace">{t('workspace.projectHubVisibilityWorkspace')}</option>
          </select>
        </label>
      </div>
      {visibilityMode === 'custom' ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border/80 bg-background/50 p-3">
            <p className={`text-xs font-semibold ${titleCls}`}>{t('workspace.projectHubVisMatrixTitle')}</p>
            <p className={`mt-0.5 text-[11px] leading-relaxed ${muted}`}>{t('workspace.projectHubVisMatrixHint')}</p>
            <ul className="mt-3 divide-y divide-border/60">
              {VIS_AUDIENCES.map(({ key, locked }) => (
                <li key={key} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                      checked={Boolean(visibilityPolicy.discoverAudiences?.[key])}
                      disabled={locked}
                      onChange={(e) => setDiscoverAudience(key, e.target.checked)}
                    />
                    <span className="truncate">{t(`workspace.projectHubAudience_${key}`)}</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground sm:w-36"
                    value={visibilityPolicy.defaultInformationLevels?.[key] || 'summary'}
                    onChange={(e) => setAudienceLevel(key, e.target.value)}
                  >
                    {VIS_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {t(`workspace.projectHubVisLevel_${lv}`)}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/50 p-3">
            <p className={`text-xs font-semibold ${titleCls}`}>
              {t('workspace.projectHubVisOverrideTitle')}
            </p>
            <p className={`mt-0.5 text-[11px] leading-relaxed ${muted}`}>
              {t('workspace.projectHubVisOverrideHint')}
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                checked={Boolean(visibilityPolicy.allowProjectManagerOverride)}
                onChange={(e) => setAllowProjectManagerOverride(e.target.checked)}
              />
              <span>{t('workspace.projectHubVisAllowPmOverride')}</span>
            </label>
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <p className={fieldLabelCls}>{t('workspace.projectHubFieldRelatedDepts')}</p>
        <p className={`mt-1 text-[11px] font-normal leading-relaxed ${muted}`}>{t('workspace.projectHubRelatedDeptsHint')}</p>
        <div className={chipRowCls}>
          {!departments.length ? (
            <p className={`px-1 py-2 text-[11px] font-normal ${muted}`}>
              {rolesLoading ? t('workspace.projectHubSettingsCatalogLoading') : t('workspace.projectHubRelatedDeptsEmpty')}
            </p>
          ) : (
            departments.map((d) => {
              const id = String(d._id || d.id || '');
              const checked = relatedDepartmentIds.includes(id);
              return (
                <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium ${checked ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/40'}`}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                    checked={checked}
                    onChange={() => {
                      setRelatedDepartmentIds((prev) => (checked ? prev.filter((x) => x !== id) : [...prev, id]));
                    }}
                  />
                  <span className="truncate">{d.name || id}</span>
                </label>
              );
            })
          )}
        </div>
        {!departments.length && !rolesLoading ? (
          <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setCatalogToken((n) => n + 1)}>
            {t('workspace.projectHubSettingsCatalogRetry')}
          </button>
        ) : null}
      </div>
    </div>
  );

  const staffingBody = (
    <div>
      <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubSettingsStaffingHint')}</p>
      {rolesLoading ? (
        <p className={`mt-3 text-xs ${muted}`}>{t('workspace.projectHubSettingsCatalogLoading')}</p>
      ) : !assignableRoles.length ? (
        <div className="mt-3">
          <p className={`text-xs ${muted}`}>{t('workspace.projectHubSettingsStaffingNoRoles')}</p>
          <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setCatalogToken((n) => n + 1)}>
            {t('workspace.projectHubSettingsCatalogRetry')}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {assignableRoles.map((role) => {
            const roleKey = String(role.key || '').trim();
            const count = staffingCountByKey.get(roleKey) || 0;
            return (
              <label key={role._id || roleKey} className="rounded-lg border border-border/80 bg-background/40 px-3 py-2.5">
                <span className={`block truncate text-xs font-semibold ${titleCls}`}>{shortRoleLabel(role.label, roleKey)}</span>
                <span className={`mt-0.5 block truncate font-mono text-[10px] ${muted}`}>{roleKey}</span>
                <input type="number" min="0" step="1" className={`${inputCls} mt-2`} value={count} onChange={(e) => setRequiredRoleCount(roleKey, e.target.value)} />
              </label>
            );
          })}
        </div>
      )}
      <p className={`mt-2 text-[11px] ${muted}`}>{t('workspace.projectHubSettingsStaffingZeroHint')}</p>
    </div>
  );

  const workflowBody = (
    <div className="space-y-5">
      <div>
        <p className={`text-xs leading-relaxed ${muted}`}>
          {t('workspace.projectHubWorkflowMethodologyHint')}
        </p>
        {!profileHydrated ? (
          <p className={`mt-2 text-xs ${muted}`} role="status">
            {t('workspace.projectHubSettingsCatalogLoading')}
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`${fieldLabelCls} sm:col-span-2`}>
            {t('workspace.projectHubFieldMethodology')}
            <select
              className={inputCls}
              value={methodology}
              disabled={!profileHydrated || saving}
              onChange={(e) => setMethodology(e.target.value)}
            >
              {PROJECT_METHODOLOGIES.map((value) => (
                <option key={value} value={value}>
                  {t(`workspace.projectHubMethodology_${value}`)}
                </option>
              ))}
            </select>
          </label>
          {methodology === 'scrum' ? (
            <>
              <label className={fieldLabelCls}>
                {t('workspace.projectHubFieldSprintDuration')}
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  className={inputCls}
                  value={sprintDurationDays}
                  disabled={!profileHydrated || saving}
                  onChange={(e) => setSprintDurationDays(e.target.value)}
                />
              </label>
              <label className={fieldLabelCls}>
                {t('workspace.projectHubFieldSprintStartDay')}
                <select
                  className={inputCls}
                  value={sprintStartDay}
                  disabled={!profileHydrated || saving}
                  onChange={(e) => setSprintStartDay(e.target.value)}
                >
                  {SPRINT_WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`workspace.projectHubWeekday_${day}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {methodology === 'kanban' ? (
            <label className={`${fieldLabelCls} sm:col-span-2`}>
              {t('workspace.projectHubFieldWipLimit')}
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                className={inputCls}
                value={wipLimit}
                disabled={!profileHydrated || saving}
                onChange={(e) => setWipLimit(e.target.value)}
              />
              <span className={`mt-1 block text-[11px] font-normal ${muted}`}>
                {t('workspace.projectHubFieldWipLimitHint')}
              </span>
            </label>
          ) : null}
        </div>
      </div>
      <div className="border-t border-border/60 pt-4">
        <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubWorkflowHint')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className={`min-w-0 flex-1 ${fieldLabelCls}`}>
            {t('workspace.projectHubWorkflowTemplateLabel')}
            <select
              className={inputCls}
              value={workflowTemplateId}
              onChange={(e) => setWorkflowTemplateId(e.target.value)}
              disabled={applyingWorkflow}
            >
              <option value="">—</option>
              {workflowTemplates.map((tpl) => (
                <option key={String(tpl._id)} value={String(tpl._id)}>
                  {tpl.name} ({(tpl.statuses || []).length} statuses)
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!workflowTemplateId || !resolvedProjectId || applyingWorkflow}
            className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
            onClick={async () => {
              if (!resolvedProjectId || !workflowTemplateId) return;
              setApplyingWorkflow(true);
              try {
                await taskAPI.applyProjectWorkflow(resolvedProjectId, {
                  templateId: workflowTemplateId,
                });
                toast.success(t('adminTasks.workflowTemplateApplied'));
                onSaved?.();
              } catch (err) {
                toast.error(
                  resolveApiErrorMessage(err, {
                    t,
                    fallback: t('adminTasks.workflowTemplateApplyFail'),
                  })
                );
              } finally {
                setApplyingWorkflow(false);
              }
            }}
          >
            {applyingWorkflow ? '…' : t('adminTasks.workflowApplyTemplate')}
          </button>
        </div>
      </div>
    </div>
  );

  const statusPriorityBody = (
    <div className="space-y-5">
      <div>
        <p className={`text-xs font-semibold ${titleCls}`}>{t('adminTasks.statusList')}</p>
        <p className={`mb-2 text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubSettingsStatusHint')}</p>
        {workflowDoc ? (
          <CatalogKeyLabelEditor
            items={statesToEditorItems(workflowStates)}
            disabled={saving}
            addKeyPh="blocked"
            addLabelPh="Blocked"
            addText={t('adminTasks.workflowAddState')}
            deleteAria={t('adminTasks.catalogDelete')}
            onChange={(items) => setWorkflowStates((prev) => mergeEditorItemsToStates(items, prev))}
          />
        ) : (
          <p className={`text-xs ${muted}`}>{t('workspace.projectHubSettingsStatusNeedWorkflow')}</p>
        )}
      </div>
      <div>
        <p className={`text-xs font-semibold ${titleCls}`}>{t('adminTasks.priorityList')}</p>
        <p className={`mb-2 text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubSettingsPriorityHint')}</p>
        <CatalogKeyLabelEditor
          items={priorityItems}
          disabled={saving}
          addKeyPh="blocker"
          addLabelPh="Blocker"
          addText={t('adminTasks.catalogAddPriority')}
          deleteAria={t('adminTasks.catalogDelete')}
          onChange={setPriorityItems}
        />
      </div>
    </div>
  );

  const approvalBody = (
    <div className="space-y-4">
      <div>
        <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubApprovalHint')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className={`min-w-0 flex-1 ${fieldLabelCls}`}>
            {t('workspace.projectHubApprovalPolicyLabel')}
            <select className={inputCls} value={taskDonePolicyId} onChange={(e) => setTaskDonePolicyId(e.target.value)} disabled={bindingApproval}>
              <option value="">{t('workspace.projectHubApprovalNone')}</option>
              {approvalPolicies
                .filter((p) => (p.entityTypes || []).includes('task') || String(p.key || '').startsWith('task_done'))
                .map((p) => (
                  <option key={String(p._id)} value={String(p._id)}>{p.name}</option>
                ))}
            </select>
          </label>
        </div>
      </div>
      <div>
        <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubCrApprovalPolicyHint')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className={`min-w-0 flex-1 ${fieldLabelCls}`}>
            {t('workspace.projectHubCrApprovalPolicyLabel')}
            <select className={inputCls} value={crApprovalPolicyId} onChange={(e) => setCrApprovalPolicyId(e.target.value)} disabled={bindingApproval}>
              <option value="">{t('workspace.projectHubApprovalNone')}</option>
              {approvalPolicies
                .filter((p) => (p.entityTypes || []).includes('change_request') || p.key === 'change_request_default')
                .map((p) => (
                  <option key={String(p._id)} value={String(p._id)}>{p.name}</option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!resolvedProjectId || bindingApproval}
            className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
            onClick={async () => {
              if (!resolvedProjectId) return;
              setBindingApproval(true);
              try {
                await projectAPI.bindProjectApprovalPolicy(resolvedProjectId, taskDonePolicyId || null, {
                  changeRequestPolicyId: crApprovalPolicyId || null,
                });
                toast.success(t('adminTasks.workflowTemplateApplied'));
                onSaved?.();
              } catch (err) {
                toast.error(resolveApiErrorMessage(err, { t, fallback: t('adminTasks.approvalPolicyLoadFail') }));
              } finally {
                setBindingApproval(false);
              }
            }}
          >
            {bindingApproval ? '…' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );

  const sectionBody = {
    identity: identityBody,
    profile: profileBody,
    visibility: visibilityBody,
    staffing: staffingBody,
    workflow: workflowBody,
    statusPriority: statusPriorityBody,
    approval: approvalBody,
    workTypes: (
      <ProjectHubWorkTypeHierarchy
        t={t}
        projectId={resolvedProjectId}
        serverConfig={serverWorkTypeConfig}
      />
    ),
    delegation: (
      <ProjectHubDelegationSection
        boardId={boardId}
        t={t}
        muted={muted}
        fieldLabelCls={fieldLabelCls}
        inputCls={inputCls}
      />
    ),
  };

  const activeGroup = groups.find((g) => g.id === openSection);
  const showSaveFooter =
    openSection === 'identity' ||
    openSection === 'profile' ||
    openSection === 'visibility' ||
    openSection === 'staffing' ||
    openSection === 'statusPriority' ||
    openSection === 'workflow';

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5">
        <header className="mb-5 border-b border-border/60 pb-4">
          <h3 className={`text-base font-bold ${titleCls}`}>{t('workspace.projectHubTabSettings')}</h3>
          <p className={`mt-0.5 max-w-xl text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubSettingsHint')}</p>
        </header>

        <ul className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => setOpenSection(group.id)}
                className="flex w-full items-start gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-foreground hover:border-primary/40"
                aria-label={t('workspace.projectHubSettingsOpenAria', { title: group.title })}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${titleCls}`}>{group.title}</p>
                  <p className={`mt-0.5 text-[11px] leading-snug ${muted}`}>{group.hint}</p>
                </div>
                <ChevronRight size={16} className={`mt-0.5 shrink-0 ${muted}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <ProjectHubSettingsPopover
          isOpen={Boolean(openSection)}
          title={activeGroup?.title || ''}
          onClose={closePopover}
          t={t}
          footer={showSaveFooter ? saveFooter : closeOnlyFooter}
        >
          {openSection ? sectionBody[openSection] : null}
        </ProjectHubSettingsPopover>
      </div>
    </div>
  );
}
