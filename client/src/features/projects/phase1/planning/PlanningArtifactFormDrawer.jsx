/**
 * Create / edit Planning artifact — fields mirror Excel workbook catalog per kind.
 * variant: 'pane' | 'modal'
 */
import { useEffect, useState } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import {
  buildPlanningSubmitPayload,
  countPlanningFormFields,
  draftFromPlanningArtifact,
  emptyPlanningDraft,
  fieldsForPlanningKind,
  planningFieldLabelKey,
} from './planningWorkbookFields';
import PlanningRolesFormSection from './PlanningRolesFormSection';

const IMPACT_OPTS = ['low', 'medium', 'high'];
const DEP_OPTS = ['FS', 'SS', 'FF', 'SF'];

function FormFields({ draft, setDraft, kind, isEdit, readOnly = false, t }) {
  const disabled = Boolean(readOnly);
  const fields = fieldsForPlanningKind(kind);
  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const fieldCount = countPlanningFormFields(kind);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
      <p className="text-[11px] text-muted-foreground">
        {t('workspace.phase1PlanningFormFieldsHint', { count: fieldCount })}
      </p>
      {fields.map((f) => {
        const label = t(planningFieldLabelKey(f.key));
        if (f.key === 'externalKey' && isEdit) {
          return (
            <p key={f.key} className="font-mono text-xs text-muted-foreground">
              {label}: {draft.externalKey}
            </p>
          );
        }

        if (f.input === 'textarea') {
          return (
            <label key={f.key} className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
                {f.required ? ' *' : ''}
              </span>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
                value={draft[f.key] || ''}
                disabled={disabled}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </label>
          );
        }

        if (f.input === 'selectDep') {
          return (
            <label key={f.key} className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
                {f.required ? ' *' : ''}
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
                value={draft[f.key] || 'FS'}
                disabled={disabled}
                onChange={(e) => setField(f.key, e.target.value)}
              >
                {DEP_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (f.input === 'selectImpact') {
          return (
            <label key={f.key} className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
                {f.required ? ' *' : ''}
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
                value={draft[f.key] || 'medium'}
                disabled={disabled}
                onChange={(e) => setField(f.key, e.target.value)}
              >
                {IMPACT_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {t(`workspace.phase1PlanningImpact_${o}`)}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={f.key} className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {label}
              {f.required ? ' *' : ''}
            </span>
            <input
              type={f.input === 'date' ? 'date' : f.input === 'number' ? 'number' : 'text'}
              min={f.input === 'number' ? 0 : undefined}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
              value={draft[f.key] || ''}
              disabled={disabled}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={
                f.key === 'skillKeys' ? t('workspace.phase1PlanningFieldSkillKeysPh') : undefined
              }
            />
          </label>
        );
      })}

      {String(kind).toUpperCase() === 'RESOURCE' ? (
        <PlanningRolesFormSection
          rolesDraft={draft.rolesDraft || []}
          setRolesDraft={(updater) =>
            setDraft((d) => ({
              ...d,
              rolesDraft: typeof updater === 'function' ? updater(d.rolesDraft || []) : updater,
            }))
          }
          disabled={disabled}
          t={t}
        />
      ) : null}
    </div>
  );
}

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
  const [draft, setDraft] = useState(() => emptyPlanningDraft(kind));
  const k = String(kind || artifact?.kind || '').toUpperCase();
  const isEdit = mode === 'edit';
  const contentEditable =
    !isEdit ||
    ['draft', 'rejected', 'changes_requested'].includes(
      String(artifact?.status || 'draft').toLowerCase()
    );

  useEffect(() => {
    if (!open) return;
    setDraft(isEdit && artifact ? draftFromPlanningArtifact(artifact) : emptyPlanningDraft(kind));
  }, [open, isEdit, artifact, kind]);

  if (!open) return null;

  const canSave =
    contentEditable &&
    (isEdit || draft.externalKey.trim()) &&
    draft.title.trim() &&
    !busy &&
    !transitioning;

  const header = (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
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
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-[#FAFAFA] px-4 py-3 dark:bg-slate-900/50">
      <button
        type="button"
        className="rounded-full border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm text-[#595959] hover:bg-[#FAFAFA] disabled:opacity-50"
        onClick={onClose}
        disabled={busy || transitioning}
      >
        {t('common.cancel')}
      </button>
      {contentEditable ? (
        <button
          type="button"
          className="rounded-full border border-[#1677FF] bg-white px-4 py-1.5 text-sm font-semibold text-[#1677FF] hover:bg-[#E6F4FF] disabled:opacity-50"
          disabled={!canSave}
          onClick={() => onSubmit?.(buildPlanningSubmitPayload(k, draft))}
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      ) : null}
      {isEdit && nextStatus && onTransition ? (
        <button
          type="button"
          className="rounded-full bg-[#1677FF] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0958D9] disabled:opacity-50"
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

  const shellClass = 'flex h-full min-h-0 flex-col overflow-hidden';

  const inner = (
    <>
      {header}
      <FormFields
        draft={draft}
        setDraft={setDraft}
        kind={k}
        isEdit={isEdit}
        readOnly={!contentEditable && isEdit}
        t={t}
      />
      {footer}
    </>
  );

  if (variant === 'pane') {
    return <div className={shellClass}>{inner}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[92vh] w-full max-w-lg rounded-t-2xl border border-border bg-surface shadow-lg sm:rounded-2xl ${shellClass}`}
      >
        {inner}
      </div>
    </div>
  );
}
