import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Flag, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { unwrapChangeRequestEntity } from './projectHubUtils';

const CR_TYPES = [
  'requirement_change',
  'scope_change',
  'design_change',
  'technical_change',
  'other',
];
const CR_PRIORITIES = ['low', 'medium', 'high', 'critical'];

const EMPTY_FORM = {
  title: '',
  description: '',
  type: 'requirement_change',
  priority: 'medium',
  reason: '',
  current: '',
  requestedChange: '',
};

function formFromInitial(initial) {
  if (!initial) return { ...EMPTY_FORM };
  return {
    title: String(initial.title || ''),
    description: String(initial.description || ''),
    type: CR_TYPES.includes(initial.type) ? initial.type : 'requirement_change',
    priority: CR_PRIORITIES.includes(initial.priority) ? initial.priority : 'medium',
    reason: String(initial.reason || ''),
    current: String(initial.current || ''),
    requestedChange: String(initial.requestedChange || ''),
  };
}

/**
 * Create / Edit Change Request — không gửi code / createdBy / projectId / status.
 * Create: layout kiểu ClickUp (title lớn + chips). Edit: form cổ điển.
 */
export default function ProjectHubChangeRequestFormModal({
  isOpen = false,
  mode = 'create',
  projectId = '',
  initial = null,
  onClose = null,
  onSaved = null,
}) {
  const { t } = useAppStrings();
  const isEdit = mode === 'edit';
  const crId = useMemo(() => String(initial?._id || initial?.id || ''), [initial]);

  const [title, setTitle] = useState(EMPTY_FORM.title);
  const [description, setDescription] = useState(EMPTY_FORM.description);
  const [type, setType] = useState(EMPTY_FORM.type);
  const [priority, setPriority] = useState(EMPTY_FORM.priority);
  const [reason, setReason] = useState(EMPTY_FORM.reason);
  const [current, setCurrent] = useState(EMPTY_FORM.current);
  const [requestedChange, setRequestedChange] = useState(EMPTY_FORM.requestedChange);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const next = formFromInitial(isEdit ? initial : null);
    setTitle(next.title);
    setDescription(next.description);
    setType(next.type);
    setPriority(next.priority);
    setReason(next.reason);
    setCurrent(next.current);
    setRequestedChange(next.requestedChange);
    setSubmitting(false);
    setError('');
    setMoreOpen(Boolean(next.reason || next.current));
  }, [isOpen, isEdit, initial]);

  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

  const typeLabel = (value) => {
    const key = `workspace.projectHubCrType_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };
  const priorityLabel = (value) => {
    const key = `workspace.projectHubCrPriority_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };

  const validate = () => {
    if (!String(title || '').trim()) return t('workspace.projectHubCrFormTitleRequired');
    if (!String(description || '').trim()) return t('workspace.projectHubCrFormDescriptionRequired');
    if (!String(requestedChange || '').trim()) return t('workspace.projectHubCrFormRequestedChangeRequired');
    if (!CR_TYPES.includes(type)) return t('workspace.projectHubCrFormTypeRequired');
    if (!CR_PRIORITIES.includes(priority)) return t('workspace.projectHubCrFormPriorityRequired');
    return '';
  };

  const canSubmit = Boolean(projectId) && !submitting && (!isEdit || Boolean(crId));

  const submit = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const body = {
      title: String(title).trim(),
      description: String(description).trim(),
      type,
      priority,
      reason: String(reason || '').trim(),
      current: String(current || '').trim(),
      requestedChange: String(requestedChange).trim(),
    };
    try {
      const res = isEdit
        ? await projectAPI.patchChangeRequest(projectId, crId, body)
        : await projectAPI.createChangeRequest(projectId, body);
      const saved = unwrapChangeRequestEntity(res);
      toast.success(t(isEdit ? 'workspace.projectHubCrUpdated' : 'workspace.projectHubCrCreated'));
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      const fallback = t(isEdit ? 'workspace.projectHubCrUpdateFail' : 'workspace.projectHubCrCreateFail');
      const apiMsg = resolveApiErrorMessage(err, { t, fallback });
      setError(apiMsg);
      toast.error(apiMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const chipCls =
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-xs font-semibold text-foreground outline-none focus-within:border-primary';

  const createBody = (
    <div className="flex flex-col gap-4">
      <input
        className="w-full border-0 bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('workspace.projectHubCrFormTitlePh')}
        disabled={submitting}
        maxLength={300}
        autoFocus
        aria-label={t('workspace.projectHubCrColTitle')}
      />
      <textarea
        className="min-h-[5rem] w-full resize-y border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('workspace.projectHubCrFormDescriptionPh')}
        disabled={submitting}
        rows={3}
        aria-label={t('workspace.projectHubCrFieldDescription')}
      />
      <label className="block">
        <span className="sr-only">{t('workspace.projectHubCrFormRequestedChange')}</span>
        <textarea
          className="min-h-[4.5rem] w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          value={requestedChange}
          onChange={(e) => setRequestedChange(e.target.value)}
          placeholder={t('workspace.projectHubCrFormRequestedChangePh')}
          disabled={submitting}
          rows={3}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className={chipCls}>
          <Layers size={14} aria-hidden className="text-muted-foreground" />
          <select
            className="max-w-[11rem] bg-transparent outline-none"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={submitting}
            aria-label={t('workspace.projectHubCrColType')}
          >
            {CR_TYPES.map((id) => (
              <option key={id} value={id}>
                {typeLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label className={chipCls}>
          <Flag size={14} aria-hidden className="text-muted-foreground" />
          <select
            className="max-w-[8rem] bg-transparent outline-none"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={submitting}
            aria-label={t('workspace.projectHubCrColPriority')}
          >
            {CR_PRIORITIES.map((id) => (
              <option key={id} value={id}>
                {priorityLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {t('workspace.projectHubCrFormMoreFields')}
          <ChevronDown size={14} aria-hidden className={moreOpen ? 'rotate-180' : ''} />
        </button>
      </div>

      {moreOpen ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <label className="block text-xs font-semibold text-muted-foreground">
            {t('workspace.projectHubCrFormReasonOptional')}
            <textarea
              className={`${inputCls} min-h-[3.5rem] resize-y`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('workspace.projectHubCrFormReasonPh')}
              disabled={submitting}
              rows={2}
            />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            {t('workspace.projectHubCrFormCurrentOptional')}
            <textarea
              className={`${inputCls} min-h-[3.5rem] resize-y`}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={t('workspace.projectHubCrFormCurrentPh')}
              disabled={submitting}
              rows={2}
            />
          </label>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onClose?.()}
          disabled={submitting}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubCrFormSubmitCreateTask')}
        </button>
      </div>
    </div>
  );

  const editBody = (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-muted-foreground">
        {t('workspace.projectHubCrColTitle')} *
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('workspace.projectHubCrFormTitlePh')}
          disabled={submitting}
          maxLength={300}
          autoFocus
        />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        {t('workspace.projectHubCrFieldDescription')} *
        <textarea
          className={`${inputCls} min-h-[6rem] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('workspace.projectHubCrFormDescriptionPh')}
          disabled={submitting}
          rows={4}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('workspace.projectHubCrColType')} *
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={submitting}
          >
            {CR_TYPES.map((id) => (
              <option key={id} value={id}>
                {typeLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('workspace.projectHubCrColPriority')} *
          <select
            className={inputCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={submitting}
          >
            {CR_PRIORITIES.map((id) => (
              <option key={id} value={id}>
                {priorityLabel(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-muted-foreground">
        {t('workspace.projectHubCrFormReasonOptional')}
        <textarea
          className={`${inputCls} min-h-[4rem] resize-y`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('workspace.projectHubCrFormReasonPh')}
          disabled={submitting}
          rows={3}
        />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        {t('workspace.projectHubCrFormCurrentOptional')}
        <textarea
          className={`${inputCls} min-h-[4rem] resize-y`}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={t('workspace.projectHubCrFormCurrentPh')}
          disabled={submitting}
          rows={3}
        />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        {t('workspace.projectHubCrFormRequestedChange')} *
        <textarea
          className={`${inputCls} min-h-[4rem] resize-y`}
          value={requestedChange}
          onChange={(e) => setRequestedChange(e.target.value)}
          placeholder={t('workspace.projectHubCrFormRequestedChangePh')}
          disabled={submitting}
          rows={3}
        />
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onClose?.()}
          disabled={submitting}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubCrFormSubmitSave')}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={submitting ? undefined : onClose}
      closable={!submitting}
      title={t(isEdit ? 'workspace.projectHubCrFormEditTitle' : 'workspace.projectHubCrFormCreateTitle')}
      size={isEdit ? 'md' : 'lg'}
    >
      {isEdit ? editBody : createBody}
    </Modal>
  );
}
