import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import aiTaskService from '../../services/aiTaskService';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import toast from 'react-hot-toast';

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
  teamsInScope = [],
  canUseAi = false,
  /** Prefill từ Project Brief (BGĐ → PM) */
  initialValues = null,
  fromBriefId = '',
}) {
  const { t } = useAppStrings();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [background, setBackground] = useState(BACKGROUND_PRESETS[0]);
  const [customBackground, setCustomBackground] = useState('');
  const [aiDraftId, setAiDraftId] = useState('');
  const [suggestedLists, setSuggestedLists] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const init = initialValues && typeof initialValues === 'object' ? initialValues : {};
    setTitle(String(init.title || ''));
    setDescription(String(init.description || init.body || ''));
    setProjectCode(String(init.projectCode || ''));
    setDueDate(toDateInputValue(init.dueDate));
    setBrief(String(init.brief || init.body || ''));
    setAiDraftId('');
    setSuggestedLists([]);
    const scope = String(defaultScopeType || 'team').toLowerCase();
    setVisibility(scope === 'department' || scope === 'division' ? 'workspace' : 'private');
    setBackground(BACKGROUND_PRESETS[0]);
    setCustomBackground('');
    // Chỉ reset khi mở modal / đổi brief — không phụ thuộc object identity của initialValues
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isOpen, defaultScopeType, fromBriefId]);

  const backgroundValue = useMemo(() => {
    const custom = String(customBackground || '').trim();
    return custom || background;
  }, [background, customBackground]);

  const canSubmit = String(title || '').trim().length > 0 && !creating && !aiLoading;

  const handleAiSuggest = async () => {
    if (!organizationId || !canUseAi) return;
    setAiLoading(true);
    try {
      const res = await aiTaskService.createProjectDraft({
        organizationId: String(organizationId),
        brief: brief || description || title,
        title,
        projectCode,
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
      if (payload.projectCode) setProjectCode(String(payload.projectCode));
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
    <Modal isOpen={isOpen} onClose={onClose} title={t('organization.createTaskBoardTitle')} size="md">
      <div className="space-y-4">
        <div className="text-xs text-slate-400">
          {t('organization.scopeLabel')}:{' '}
          <span className="text-slate-200">{defaultScopeLabel || defaultTeamName || '—'}</span>
        </div>

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
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardProjectCodeLabel')}</div>
          <input
            value={projectCode}
            maxLength={64}
            onChange={(e) => setProjectCode(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('organization.taskBoardProjectCodePlaceholder')}
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

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardDueDateLabel')}</div>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">{t('organization.taskBoardDueDateHint')}</p>
        </div>

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
          {String(defaultScopeType || '').toLowerCase() === 'department' ? (
            <p className="mt-1 text-xs text-slate-400">{t('organization.taskBoardDeptVisibilityHint')}</p>
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
            onClick={() =>
              onSubmit?.({
                title: String(title || '').trim(),
                description: String(description || '').trim(),
                projectCode: String(projectCode || '').trim(),
                dueDate: dueDate
                  ? new Date(`${dueDate}T23:59:00`).toISOString()
                  : undefined,
                background: backgroundValue,
                visibility,
                aiDraftId: aiDraftId || undefined,
                suggestedLists,
                fromBriefId: fromBriefId || undefined,
              })
            }
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {creating
              ? t('organization.taskBoardCreating')
              : aiDraftId
                ? t('taskBoard.aiProjectCreateConfirm')
                : t('organization.createTaskBoardTitle')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
