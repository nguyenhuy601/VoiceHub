import { useEffect, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';

function emptyDraft(kind) {
  return {
    externalKey: '',
    title: '',
    summary: '',
    parentExternalKey: '',
    startDate: '',
    endDate: '',
    targetDate: '',
    effortHours: '',
    fromKey: '',
    toKey: '',
    dependencyType: 'FS',
  };
}

function draftFromArtifact(artifact) {
  const st = artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  return {
    externalKey: artifact?.externalKey || '',
    title: artifact?.title || '',
    summary: artifact?.summary || '',
    parentExternalKey: artifact?.parentExternalKey || '',
    startDate: st.startDate || '',
    endDate: st.endDate || '',
    targetDate: st.targetDate || '',
    effortHours: st.effortHours != null ? String(st.effortHours) : '',
    fromKey: st.fromKey || '',
    toKey: st.toKey || '',
    dependencyType: st.dependencyType || 'FS',
  };
}

function buildStructured(kind, draft) {
  const structured = {};
  if (draft.startDate) structured.startDate = draft.startDate;
  if (draft.endDate) structured.endDate = draft.endDate;
  if (draft.targetDate) structured.targetDate = draft.targetDate;
  if (draft.effortHours !== '') {
    const n = Number(draft.effortHours);
    if (Number.isFinite(n)) structured.effortHours = n;
  }
  if (String(kind).toUpperCase() === 'DEPENDENCY') {
    if (draft.fromKey) structured.fromKey = draft.fromKey;
    if (draft.toKey) structured.toKey = draft.toKey;
    structured.dependencyType = draft.dependencyType || 'FS';
  }
  return structured;
}

function FormFields({
  draft,
  setDraft,
  k,
  isEdit,
  readOnly = false,
  showDates,
  showEffort,
  showDependency,
  t,
}) {
  const disabled = Boolean(readOnly);
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {!isEdit ? (
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {t('workspace.phase1PlaceholderExternalKey')}
          </span>
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
            value={draft.externalKey}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, externalKey: e.target.value }))}
          />
        </label>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">{draft.externalKey}</p>
      )}
      <label className="block text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          {t('workspace.phase1PlaceholderTitle')}
        </span>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
          value={draft.title}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          {t('workspace.phase1PlaceholderSummary')}
        </span>
        <textarea
          className="mt-1 min-h-[72px] w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
          value={draft.summary}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          {t('workspace.phase1ParentKey')}
        </span>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
          value={draft.parentExternalKey}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, parentExternalKey: e.target.value }))}
        />
      </label>
      {showDates && k !== 'MILESTONE' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase1StartDate')}
            </span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
              value={draft.startDate}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase1EndDate')}
            </span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
              value={draft.endDate}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            />
          </label>
        </div>
      ) : null}
      {(k === 'MILESTONE' || k === 'RELEASE') && (
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {t('workspace.phase1TargetDate')}
          </span>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
            value={draft.targetDate}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))}
          />
        </label>
      )}
      {showEffort ? (
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {t('workspace.phase1RoleEffort')}
          </span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
            value={draft.effortHours}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, effortHours: e.target.value }))}
          />
        </label>
      ) : null}
      {showDependency ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase1DepFrom')}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
              value={draft.fromKey}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, fromKey: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {t('workspace.phase1DepTo')}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
              value={draft.toKey}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, toKey: e.target.value }))}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Create / edit Planning artifact — pane (split) or modal (mobile fallback).
 * variant: 'pane' | 'modal'
 */
export default function PlanningArtifactFormDrawer({
  open,
  mode = 'create',
  kind,
  artifact = null,
  busy = false,
  transitioning = false,
  nextStatus = null,
  onClose,
  onSubmit,
  onTransition,
  variant = 'modal',
}) {
  const { t } = useAppStrings();
  const [draft, setDraft] = useState(() => emptyDraft(kind));
  const k = String(kind || artifact?.kind || '').toUpperCase();
  const showDates = ['WBS', 'SCHEDULE', 'RELEASE', 'MILESTONE', 'DEPENDENCY'].includes(k);
  const showEffort = k === 'WBS' || k === 'RESOURCE';
  const showDependency = k === 'DEPENDENCY';
  const isEdit = mode === 'edit';
  const contentEditable =
    isEdit && ['draft', 'rejected'].includes(String(artifact?.status || 'draft').toLowerCase());

  useEffect(() => {
    if (!open) return;
    setDraft(isEdit && artifact ? draftFromArtifact(artifact) : emptyDraft(kind));
  }, [open, isEdit, artifact, kind]);

  if (!open) return null;

  const canSave =
    contentEditable && (isEdit || draft.externalKey.trim()) && draft.title.trim() && !busy && !transitioning;

  const header = (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <div>
        <h2 className="text-sm font-semibold">
          {isEdit ? t('workspace.phase1EditArtifact') : t('workspace.phase1CreateArtifact')}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {k}
          {isEdit && artifact?.status ? ` · ${artifact.status}` : ''}
        </p>
      </div>
      <button type="button" className="rounded border border-border px-2 py-0.5 text-xs" onClick={onClose}>
        {t('common.close')}
      </button>
    </div>
  );

  const footer = (
    <div className="flex flex-wrap justify-end gap-2 border-t border-border px-3 py-2">
      <button
        type="button"
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
        onClick={onClose}
        disabled={busy || transitioning}
      >
        {t('common.cancel')}
      </button>
      {contentEditable ? (
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
          disabled={!canSave}
          onClick={() =>
            onSubmit?.({
              externalKey: draft.externalKey.trim(),
              title: draft.title.trim(),
              summary: draft.summary.trim(),
              parentExternalKey: draft.parentExternalKey.trim(),
              structured: buildStructured(k, draft),
            })
          }
        >
          {t('common.save')}
        </button>
      ) : null}
      {isEdit && nextStatus && onTransition ? (
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          disabled={busy || transitioning}
          onClick={() => onTransition(nextStatus)}
        >
          {transitioning
            ? t('common.saving')
            : String(artifact?.status) === 'draft'
              ? t('workspace.phase1SubmitForReview')
              : t('workspace.phase1Approve')}
        </button>
      ) : null}
    </div>
  );

  const body = (
    <>
      {header}
      <FormFields
        draft={draft}
        setDraft={setDraft}
        k={k}
        isEdit={isEdit}
        readOnly={!contentEditable && isEdit}
        showDates={showDates}
        showEffort={showEffort}
        showDependency={showDependency}
        t={t}
      />
      {footer}
    </>
  );

  if (variant === 'pane') {
    return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-lg sm:rounded-2xl"
      >
        {body}
      </div>
    </div>
  );
}
