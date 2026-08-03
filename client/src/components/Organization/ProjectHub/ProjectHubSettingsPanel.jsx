import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { taskAPI } from '../../../services/api/taskAPI';
import { projectAPI } from '../../../services/api/projectAPI';
import { organizationAPI } from '../../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { flattenOrgStructureDepartments } from '../../../utils/orgMemberStructureScope';
import { toDateInputValue } from './projectHubUtils';

function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
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

const AUDIENCE_LABEL = {
  system_admins: 'System Admins',
  organization_admins: 'Organization Admins',
  directors: 'Directors',
  project_managers: 'Project Managers',
  project_members: 'Project Members',
  related_department_managers: 'Related Department Managers',
  related_department_members: 'Related Department Members',
  all_employees: 'All Employees',
};

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
 * Settings dự án — PATCH /api/projects/:projectId
 */
export default function ProjectHubSettingsPanel({
  projectId = '',
  boardId = '',
  board = null,
  organizationId = '',
  apiCtx = null,
  canManage = false,
  isDarkMode = false,
  onSaved,
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
  const [background, setBackground] = useState('');
  const [roleCatalog, setRoleCatalog] = useState([]);
  const [requiredProjectRoles, setRequiredProjectRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [workflowTemplateId, setWorkflowTemplateId] = useState('');
  const [applyingWorkflow, setApplyingWorkflow] = useState(false);
  const [approvalPolicies, setApprovalPolicies] = useState([]);
  const [taskDonePolicyId, setTaskDonePolicyId] = useState('');
  const [bindingApproval, setBindingApproval] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

  const resolvedProjectId = String(projectId || board?.projectId || '').trim();

  useEffect(() => {
    setTitle(String(board?.title || ''));
    setProjectCode(String(board?.projectCode || ''));
    setDescription(String(board?.description || ''));
    setVisibility(board?.visibility === 'workspace' ? 'workspace' : 'private');
    setVisibilityMode(board?.visibilityMode === 'custom' ? 'custom' : 'inherit');
    setVisibilityPolicy(normalizeVisibilityPolicy(board?.visibilityPolicy));
    setRelatedDepartmentIds(
      Array.isArray(board?.relatedDepartmentIds)
        ? board.relatedDepartmentIds.map(String)
        : []
    );
    setDueDate(toDateInputValue(board?.dueDate));
    setBackground(String(board?.background || ''));
    setRequiredProjectRoles(Array.isArray(board?.requiredProjectRoles) ? board.requiredProjectRoles : []);
    setWorkflowTemplateId(String(board?.workflowTemplateId || '').trim());
    setTaskDonePolicyId(String(board?.defaultTaskDoneApprovalPolicyId || '').trim());
  }, [board]);

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
  }, [canManage, resolvedOrganizationId, resolvedProjectId]);

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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canManage || saving || !title.trim()) return;
    const id = resolvedProjectId || String(boardId || '').trim();
    if (!id) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        projectCode: projectCode.trim(),
        description,
        visibility,
        visibilityMode,
        relatedDepartmentIds,
        dueDate: dueDate || null,
        background,
        requiredProjectRoles,
      };
      if (visibilityMode === 'custom') {
        body.visibilityPolicy = visibilityPolicy;
      }
      if (resolvedProjectId) {
        await projectAPI.patch(resolvedProjectId, body);
        // Approval bind cùng Save chính — tránh chọn policy rồi chỉ bấm Lưu form.
        await projectAPI.bindProjectApprovalPolicy(
          resolvedProjectId,
          taskDonePolicyId || null
        );
      } else {
        const opts = apiCtx || { organizationId };
        await taskAPI.patchBoard(boardId, body, opts);
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

  const sectionCls = `rounded-xl border border-border bg-surface/60 p-4 sm:p-5 ${
    isDarkMode ? 'border-white/10 bg-white/[0.03]' : ''
  }`;
  const sectionTitleCls = `text-sm font-semibold tracking-tight ${titleCls}`;
  const fieldLabelCls = `block text-xs font-semibold ${muted}`;
  const chipRowCls =
    'mt-2 grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-border/80 bg-background/40 p-2 sm:grid-cols-2';

  return (
    <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
        <header className="mb-5 flex flex-col gap-1 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className={`text-base font-bold ${titleCls}`}>{t('workspace.projectHubTabSettings')}</h3>
            <p className={`mt-0.5 max-w-xl text-xs leading-relaxed ${muted}`}>
              {t('workspace.projectHubSettingsHint')}
            </p>
          </div>
          <button
            type="submit"
            form="project-hub-settings-form"
            disabled={saving || !title.trim()}
            className="mt-3 inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:mt-0"
          >
            {saving ? '…' : t('workspace.projectHubSettingsSave')}
          </button>
        </header>

        <form
          id="project-hub-settings-form"
          className="grid gap-4 lg:grid-cols-2 lg:gap-5"
          onSubmit={handleSave}
        >
          {/* Cột trái: nhận diện + visibility */}
          <div className="flex flex-col gap-4">
            <section className={sectionCls}>
              <h4 className={sectionTitleCls}>
                {t('workspace.projectHubSettingsIdentityTitle')}
              </h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  {t('workspace.projectHubFieldTitle')}
                  <input
                    className={inputCls}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </label>
                <label className={fieldLabelCls}>
                  {t('workspace.projectHubFieldCode')}
                  <input
                    className={inputCls}
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                  />
                </label>
                <label className={fieldLabelCls}>
                  {t('workspace.projectHubFieldDue')}
                  <input
                    type="date"
                    className={inputCls}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  {t('workspace.projectHubFieldDescription')}
                  <textarea
                    className={`${inputCls} min-h-[72px] resize-y`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
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
                            selected
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-border hover:border-primary/50'
                          }`}
                          style={{ background: preset }}
                        />
                      );
                    })}
                    <label
                      className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs font-medium text-foreground"
                      title={t('workspace.projectHubBackgroundPickColor')}
                    >
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
                  {background && !BOARD_BACKGROUND_PRESETS.includes(background) && !isHexColor(background) ? (
                    <p className={`mt-1.5 truncate text-[11px] font-normal ${muted}`}>{background}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h4 className={sectionTitleCls}>{t('workspace.projectHubFieldVisibilityMode')}</h4>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                {visibilityMode === 'custom'
                  ? t('workspace.projectHubVisCustomHint')
                  : t('workspace.projectHubVisInheritHint')}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={fieldLabelCls}>
                  {t('workspace.projectHubFieldVisibilityMode')}
                  <select
                    className={inputCls}
                    value={visibilityMode}
                    onChange={(e) => onVisibilityModeChange(e.target.value)}
                  >
                    <option value="inherit">{t('workspace.projectHubVisInherit')}</option>
                    <option value="custom">{t('workspace.projectHubVisCustom')}</option>
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  {t('workspace.projectHubFieldVisibility')}
                  <select
                    className={inputCls}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="private">{t('workspace.projectHubVisibilityPrivate')}</option>
                    <option value="workspace">{t('workspace.projectHubVisibilityWorkspace')}</option>
                  </select>
                </label>
              </div>

              {visibilityMode === 'custom' ? (
                <div className="mt-4 rounded-lg border border-border/80 bg-background/50 p-3">
                  <p className={`text-xs font-semibold ${titleCls}`}>
                    {t('workspace.projectHubVisMatrixTitle')}
                  </p>
                  <p className={`mt-0.5 text-[11px] leading-relaxed ${muted}`}>
                    {t('workspace.projectHubVisMatrixHint')}
                  </p>
                  <ul className="mt-3 divide-y divide-border/60">
                    {VIS_AUDIENCES.map(({ key, locked }) => (
                      <li
                        key={key}
                        className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                            checked={Boolean(visibilityPolicy.discoverAudiences?.[key])}
                            disabled={locked}
                            onChange={(e) => setDiscoverAudience(key, e.target.checked)}
                          />
                          <span className="truncate">{AUDIENCE_LABEL[key] || key}</span>
                        </label>
                        <select
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs sm:w-36"
                          value={visibilityPolicy.defaultInformationLevels?.[key] || 'summary'}
                          onChange={(e) => setAudienceLevel(key, e.target.value)}
                        >
                          {VIS_LEVELS.map((lv) => (
                            <option key={lv} value={lv}>
                              {lv}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4">
                <p className={fieldLabelCls}>{t('workspace.projectHubFieldRelatedDepts')}</p>
                <p className={`mt-1 text-[11px] font-normal leading-relaxed ${muted}`}>
                  {t('workspace.projectHubRelatedDeptsHint')}
                </p>
                <div className={chipRowCls}>
                  {!departments.length ? (
                    <p className={`px-1 py-2 text-[11px] font-normal ${muted}`}>
                      {rolesLoading ? '…' : t('workspace.projectHubRelatedDeptsEmpty')}
                    </p>
                  ) : (
                    departments.map((d) => {
                      const id = String(d._id || d.id || '');
                      const checked = relatedDepartmentIds.includes(id);
                      return (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                            checked
                              ? 'bg-primary/10 text-foreground'
                              : 'text-foreground hover:bg-muted/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                            checked={checked}
                            onChange={() => {
                              setRelatedDepartmentIds((prev) =>
                                checked ? prev.filter((x) => x !== id) : [...prev, id]
                              );
                            }}
                          />
                          <span className="truncate">{d.name || id}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Cột phải: staffing + workflow + approval */}
          <div className="flex flex-col gap-4">
            <section className={sectionCls}>
              <h4 className={sectionTitleCls}>{t('workspace.projectHubSettingsStaffingTitle')}</h4>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                {t('workspace.projectHubSettingsStaffingHint')}
              </p>
              {rolesLoading ? (
                <p className={`mt-3 text-xs ${muted}`}>…</p>
              ) : !assignableRoles.length ? (
                <p className={`mt-3 text-xs ${muted}`}>
                  {t('workspace.projectHubSettingsStaffingNoRoles')}
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {assignableRoles.map((role) => {
                    const roleKey = String(role.key || '').trim();
                    const count = staffingCountByKey.get(roleKey) || 0;
                    return (
                      <label
                        key={role._id || roleKey}
                        className="rounded-lg border border-border/80 bg-background/40 px-3 py-2.5"
                      >
                        <span className={`block truncate text-xs font-semibold ${titleCls}`}>
                          {shortRoleLabel(role.label, roleKey)}
                        </span>
                        <span className={`mt-0.5 block truncate font-mono text-[10px] ${muted}`}>
                          {roleKey}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={`${inputCls} mt-2`}
                          value={count}
                          onChange={(e) => setRequiredRoleCount(roleKey, e.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              <p className={`mt-2 text-[11px] ${muted}`}>
                {t('workspace.projectHubSettingsStaffingZeroHint')}
              </p>
            </section>

            <section className={sectionCls}>
              <h4 className={sectionTitleCls}>
                {t('workspace.projectHubWorkflowTitle')}
              </h4>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                {t('workspace.projectHubWorkflowHint')}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className={`min-w-0 flex-1 ${fieldLabelCls}`}>
                  {t('workspace.projectHubWorkflowTemplateLabel')}
                  <select
                    className={inputCls}
                    value={workflowTemplateId}
                    onChange={(e) => setWorkflowTemplateId(e.target.value)}
                    disabled={!canManage || applyingWorkflow}
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
                  disabled={!canManage || !workflowTemplateId || !resolvedProjectId || applyingWorkflow}
                  className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50 sm:h-[2.625rem]"
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
            </section>

            <section className={sectionCls}>
              <h4 className={sectionTitleCls}>
                {t('workspace.projectHubApprovalTitle')}
              </h4>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>
                {t('workspace.projectHubApprovalHint')}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className={`min-w-0 flex-1 ${fieldLabelCls}`}>
                  {t('workspace.projectHubApprovalPolicyLabel')}
                  <select
                    className={inputCls}
                    value={taskDonePolicyId}
                    onChange={(e) => setTaskDonePolicyId(e.target.value)}
                    disabled={!canManage || bindingApproval}
                  >
                    <option value="">{t('workspace.projectHubApprovalNone')}</option>
                    {approvalPolicies
                      .filter((p) => (p.entityTypes || []).includes('task') || p.key === 'task_done')
                      .map((p) => (
                        <option key={String(p._id)} value={String(p._id)}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!canManage || !resolvedProjectId || bindingApproval}
                  className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50 sm:h-[2.625rem]"
                  onClick={async () => {
                    if (!resolvedProjectId) return;
                    setBindingApproval(true);
                    try {
                      await projectAPI.bindProjectApprovalPolicy(
                        resolvedProjectId,
                        taskDonePolicyId || null
                      );
                      toast.success(t('adminTasks.workflowTemplateApplied'));
                      onSaved?.();
                    } catch (err) {
                      toast.error(
                        resolveApiErrorMessage(err, {
                          t,
                          fallback: t('adminTasks.approvalPolicyLoadFail'),
                        })
                      );
                    } finally {
                      setBindingApproval(false);
                    }
                  }}
                >
                  {bindingApproval ? '…' : t('common.save')}
                </button>
              </div>
            </section>

            <div className="sticky bottom-0 z-10 -mx-1 border-t border-border/60 bg-background/95 px-1 py-3 backdrop-blur lg:hidden">
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? '…' : t('workspace.projectHubSettingsSave')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
