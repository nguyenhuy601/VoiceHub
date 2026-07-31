import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import aiTaskService from '../../services/aiTaskService';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import toast from 'react-hot-toast';
import useAdminMembers from '../../hooks/useAdminMembers';
import { projectAPI, DEFAULT_PROJECT_ROLES } from '../../services/api/projectAPI';
import { memberDisplayName, memberUserId } from '../../utils/adminUserUtils';
import {
  DELEGATION_TEMPLATE_IDS,
  PROJECT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_PRIORITIES,
  PROJECT_METHODOLOGIES,
  buildCreateBoardMembers,
  buildCreateBoardPayload,
  normalizeDelegationTemplateId,
  validateCreateProjectIdentity,
} from '../../features/adminTasks/createProjectSeed';

const BACKGROUND_PRESETS = [
  'linear-gradient(135deg,#1f2937,#111827)',
  'linear-gradient(135deg,#7c2d12,#1f2937)',
  'linear-gradient(135deg,#0f766e,#1e293b)',
  'linear-gradient(135deg,#312e81,#1e1b4b)',
  'linear-gradient(135deg,#7e22ce,#1f2937)',
];

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function CreateTaskBoardModal({
  isOpen,
  onClose,
  onSubmit,
  creating = false,
  defaultTeamName = '',
  defaultScopeLabel = '',
  defaultScopeType = 'team',
  organizationId = '',
  scopeId = '',
  /** Optional: cho phép đổi phòng/team trước khi tạo (hub «Tạo dự án») */
  scopeOptions = null,
  onScopeIdChange = null,
  teamsInScope = [],
  canUseAi = false,
  /** Prefill từ Project Brief (BGĐ → PM) */
  initialValues = null,
  fromBriefId = '',
  /** Override tiêu đề modal (vd. Tạo dự án) */
  modalTitle = '',
}) {
  const { t } = useAppStrings();
  const { members } = useAdminMembers(isOpen ? organizationId : '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [background, setBackground] = useState(BACKGROUND_PRESETS[0]);
  const [customBackground, setCustomBackground] = useState('');
  const [aiDraftId, setAiDraftId] = useState('');
  const [suggestedLists, setSuggestedLists] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [delegationTemplateId, setDelegationTemplateId] = useState('product');
  const [showSeed, setShowSeed] = useState(false);
  const [catalogRoles, setCatalogRoles] = useState([]);
  const [seedUserId, setSeedUserId] = useState('');
  const [seedRoleKey, setSeedRoleKey] = useState('developer');
  const [seedMembers, setSeedMembers] = useState([]);
  const [projectType, setProjectType] = useState('software');
  const [category, setCategory] = useState('internal');
  const [priority, setPriority] = useState('medium');
  const [tags, setTags] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimatedDurationDays, setEstimatedDurationDays] = useState('');
  const [methodology, setMethodology] = useState('kanban');
  const [sprintDurationDays, setSprintDurationDays] = useState('14');
  const [sprintStartDay, setSprintStartDay] = useState('monday');
  const [wipLimit, setWipLimit] = useState('0');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [productOwnerId, setProductOwnerId] = useState('');
  const [scrumMasterId, setScrumMasterId] = useState('');
  const [techLeadId, setTechLeadId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contractCode, setContractCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const init = initialValues && typeof initialValues === 'object' ? initialValues : {};
    setTitle(String(init.title || ''));
    setDescription(String(init.description || init.body || ''));
    setDueDate(toDateInputValue(init.dueDate));
    setBrief(String(init.brief || init.body || ''));
    setAiDraftId('');
    setSuggestedLists([]);
    const scope = String(defaultScopeType || 'team').toLowerCase();
    setVisibility(scope === 'department' || scope === 'division' ? 'workspace' : 'private');
    setBackground(BACKGROUND_PRESETS[0]);
    setCustomBackground('');
    setDelegationTemplateId('product');
    setShowSeed(false);
    setSeedMembers([]);
    setSeedUserId('');
    setSeedRoleKey('developer');
    setProjectType('software');
    setCategory('internal');
    setPriority('medium');
    setTags('');
    setStartDate('');
    setEstimatedDurationDays('');
    setMethodology('kanban');
    setSprintDurationDays('14');
    setSprintStartDay('monday');
    setWipLimit('0');
    setProjectManagerId('');
    setProductOwnerId('');
    setScrumMasterId('');
    setTechLeadId('');
    setCustomerName('');
    setCustomerCompany('');
    setContactPerson('');
    setContractCode('');
    // Chỉ reset khi mở modal / đổi brief — không phụ thuộc object identity của initialValues
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isOpen, defaultScopeType, fromBriefId]);

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.listRoleCatalog(organizationId);
        if (!cancelled) {
          const roles = unwrap(res);
          setCatalogRoles(Array.isArray(roles) && roles.length ? roles : DEFAULT_PROJECT_ROLES);
        }
      } catch {
        if (!cancelled) setCatalogRoles(DEFAULT_PROJECT_ROLES);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId]);

  const backgroundValue = useMemo(() => {
    const custom = String(customBackground || '').trim();
    return custom || background;
  }, [background, customBackground]);

  const canSubmit =
    String(title || '').trim().length > 0 &&
    !creating &&
    !aiLoading &&
    (!Array.isArray(scopeOptions) || scopeOptions.length === 0 || String(scopeId || '').trim());

  const handleAiSuggest = async () => {
    if (!organizationId || !canUseAi) return;
    setAiLoading(true);
    try {
      const res = await aiTaskService.createProjectDraft({
        organizationId: String(organizationId),
        brief: brief || description || title,
        title,
        description,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : undefined,
        scopeType: defaultScopeType,
        scopeId: scopeId || undefined,
        teams: teamsInScope,
        visibility,
      });
      const data = res?.data?.data || res?.data || {};
      const payload = data.payload || {};
      setAiDraftId(String(data.draftId || ''));
      if (payload.title) setTitle(String(payload.title));
      if (payload.description) setDescription(String(payload.description));
      if (payload.dueDate) setDueDate(toDateInputValue(payload.dueDate));
      if (payload.visibility) setVisibility(payload.visibility);
      setSuggestedLists(Array.isArray(payload.lists) ? payload.lists : []);
      toast.success(t('taskBoard.aiProjectDraftReady'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.aiProjectDraftFail')));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle || t('organization.createTaskBoardTitle')}
      size="lg"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        {Array.isArray(scopeOptions) && scopeOptions.length > 0 && typeof onScopeIdChange === 'function' ? (
          <label className="block text-xs text-slate-300">
            {t('organizationSettings.departmentLabel')}
            <select
              value={String(scopeId || '')}
              onChange={(e) => onScopeIdChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {scopeOptions.map((opt) => (
                <option key={String(opt.id || opt._id)} value={String(opt.id || opt._id)}>
                  {opt.label || opt.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-xs text-slate-400">
            {t('organization.scopeLabel')}:{' '}
            <span className="text-slate-200">{defaultScopeLabel || defaultTeamName || '—'}</span>
          </div>
        )}

        {canUseAi ? (
          <div>
            <div className="mb-1 text-sm font-semibold text-white">{t('taskBoard.aiProjectBriefLabel')}</div>
            <textarea
              value={brief}
              maxLength={2000}
              rows={2}
              onChange={(e) => setBrief(e.target.value)}
              className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              placeholder={t('taskBoard.aiProjectBriefPh')}
            />
            <button
              type="button"
              disabled={aiLoading || creating || (!brief.trim() && !title.trim() && !description.trim())}
              onClick={handleAiSuggest}
              className="mt-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {aiLoading ? t('taskBoard.aiProjectSuggesting') : t('taskBoard.aiProjectSuggest')}
            </button>
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardTitleLabel')} *</div>
          <input
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('organization.taskBoardTitlePlaceholder')}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardDescriptionLabel')}</div>
          <textarea
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('organization.taskBoardDescriptionPlaceholder')}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-300">
            Project type
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {PROJECT_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-300">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {PROJECT_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-300">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {PROJECT_PRIORITIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-300">
            Tags
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-300">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
          <div>
            <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardDueDateLabel')}</div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <label className="block text-xs text-slate-300 sm:col-span-2">
            Estimated duration (days)
            <input
              type="number"
              min={0}
              value={estimatedDurationDays}
              onChange={(e) => setEstimatedDurationDays(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-300">
            Methodology
            <select
              value={methodology}
              onChange={(e) => setMethodology(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {PROJECT_METHODOLOGIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {methodology === 'scrum' ? (
            <>
              <label className="block text-xs text-slate-300">
                Sprint duration (days)
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={sprintDurationDays}
                  onChange={(e) => setSprintDurationDays(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <label className="block text-xs text-slate-300">
                Sprint start day
                <select
                  value={sprintStartDay}
                  onChange={(e) => setSprintStartDay(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                >
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {methodology === 'kanban' ? (
            <label className="block text-xs text-slate-300">
              WIP limit
              <input
                type="number"
                min={0}
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Project Manager', projectManagerId, setProjectManagerId],
            ['Product Owner', productOwnerId, setProductOwnerId],
            ['Scrum Master', scrumMasterId, setScrumMasterId],
            ['Tech Lead', techLeadId, setTechLeadId],
          ].map(([label, value, setter]) => (
            <label key={label} className="block text-xs text-slate-300">
              {label}
              <select
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="">—</option>
                {members.map((m) => {
                  const id = memberUserId(m);
                  return (
                    <option key={id} value={id}>
                      {memberDisplayName(m) || id}
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </div>

        {category === 'customer' ? (
          <div className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-300 sm:col-span-2">
              Customer *
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300">
              Company
              <input
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300">
              Contact person
              <input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300 sm:col-span-2">
              Contract code
              <input
                value={contractCode}
                onChange={(e) => setContractCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
          </div>
        ) : null}

        {suggestedLists.length > 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-1 text-xs font-semibold text-slate-300">{t('taskBoard.aiProjectListsPreview')}</div>
            <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-400">
              {suggestedLists.map((l, i) => (
                <li key={`${l.title}-${i}`}>• {l.title}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-sm font-semibold text-white">{t('organization.taskBoardBackground')}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setBackground(preset);
                  setCustomBackground('');
                }}
                className={`h-10 rounded-md border ${
                  background === preset && !customBackground ? 'border-indigo-400' : 'border-white/10'
                }`}
                style={{ background: preset }}
              />
            ))}
          </div>
          <input
            value={customBackground}
            onChange={(e) => setCustomBackground(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none"
            placeholder={t('organization.taskBoardBackgroundPlaceholder')}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardVisibility')}</div>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="private">{t('organization.taskBoardPrivate')}</option>
            <option value="workspace">{t('organization.taskBoardWorkspace')}</option>
          </select>
          {visibility === 'workspace' ? (
            <p className="mt-1 text-xs text-amber-200/90">{t('adminTasks.createWorkspaceWarn')}</p>
          ) : String(defaultScopeType || '').toLowerCase() === 'department' ? (
            <p className="mt-1 text-xs text-slate-400">{t('organization.taskBoardDeptVisibilityHint')}</p>
          ) : null}
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('adminTasks.createTemplate')}</div>
          <select
            value={delegationTemplateId}
            onChange={(e) => setDelegationTemplateId(normalizeDelegationTemplateId(e.target.value))}
            className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
          >
            {DELEGATION_TEMPLATE_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`adminTasks.createTemplate_${id}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            type="button"
            className="text-xs font-semibold text-indigo-300 hover:underline"
            onClick={() => setShowSeed((v) => !v)}
          >
            {showSeed ? '−' : '+'} {t('adminTasks.createSeedList')}
          </button>
          {showSeed ? (
            <div className="mt-2 space-y-2 rounded-lg border border-white/10 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={seedUserId}
                  onChange={(e) => setSeedUserId(e.target.value)}
                  className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white"
                >
                  <option value="">—</option>
                  {(members || []).map((m) => {
                    const id = memberUserId(m);
                    return (
                      <option key={id} value={id}>
                        {memberDisplayName(m) || id}
                      </option>
                    );
                  })}
                </select>
                <select
                  value={seedRoleKey}
                  onChange={(e) => setSeedRoleKey(e.target.value)}
                  className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-white"
                >
                  {(catalogRoles.length
                    ? catalogRoles
                    : [{ key: 'developer', label: 'Developer' }]
                  ).map((r) => (
                    <option key={String(r.key)} value={String(r.key)}>
                      {r.label || r.key}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const uid = String(seedUserId || '').trim();
                  const key = String(seedRoleKey || '').trim();
                  if (!uid || !key) return;
                  setSeedMembers((prev) => {
                    const existing = prev.find((m) => m.userId === uid);
                    if (existing) {
                      const keys = [...new Set([...existing.projectRoleKeys, key])];
                      return prev.map((m) =>
                        m.userId === uid ? { ...m, projectRoleKeys: keys } : m
                      );
                    }
                    return [...prev, { userId: uid, projectRoleKeys: [key] }];
                  });
                }}
                className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10"
              >
                {t('adminTasks.createAddMember')}
              </button>
              {seedMembers.length ? (
                <ul className="space-y-1 text-xs text-slate-300">
                  {seedMembers.map((m) => (
                    <li key={m.userId}>
                      {memberDisplayName(members.find((x) => memberUserId(x) === m.userId)) ||
                        m.userId}
                      : {m.projectRoleKeys.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating || aiLoading}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            {t('nav.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              const titleTrim = String(title || '').trim();
              const scopeType = String(defaultScopeType || 'team').toLowerCase();
              const scopeLabel =
                (Array.isArray(scopeOptions) &&
                  scopeOptions.find((o) => String(o.id || o._id) === String(scopeId || ''))
                    ?.label) ||
                defaultScopeLabel ||
                defaultTeamName ||
                '';
              const form = {
                title: titleTrim,
                description: String(description || '').trim(),
                scopeType,
                scopeId: String(scopeId || ''),
                scopeLabel: String(scopeLabel || '').trim(),
                dueDate,
                startDate,
                expectedEndDate: dueDate,
                estimatedDurationDays,
                background: backgroundValue,
                visibility,
                delegationTemplateId: normalizeDelegationTemplateId(delegationTemplateId),
                members: seedMembers,
                projectType,
                category,
                priority,
                tags,
                methodology,
                sprintDurationDays,
                sprintStartDay,
                wipLimit,
                projectManagerId,
                productOwnerId,
                scrumMasterId,
                techLeadId,
                customerName,
                customerCompany,
                contactPerson,
                contractCode,
              };
              const err = validateCreateProjectIdentity(form);
              if (err === 'customer') {
                toast.error('Customer bắt buộc khi Category = customer');
                return;
              }
              const payload = buildCreateBoardPayload(form, {
                organizationId,
                scopeLabel,
              });
              onSubmit?.({
                ...payload,
                aiDraftId: aiDraftId || undefined,
                suggestedLists,
                fromBriefId: fromBriefId || undefined,
              });
            }}
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {creating
              ? t('organization.taskBoardCreating')
              : aiDraftId
                ? t('taskBoard.aiProjectCreateConfirm')
                : modalTitle || t('organization.createTaskBoardTitle')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
