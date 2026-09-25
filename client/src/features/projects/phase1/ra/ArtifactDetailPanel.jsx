import { useEffect, useMemo, useRef, useState } from 'react';
import ReviewNoteDialog from '../../../../components/Shared/ReviewNoteDialog';
import { useAppStrings } from '../../../../locales/appStrings';
import {
  buildArtifactFormState,
  buildArtifactUpdateBody,
  getArtifactFieldCatalog,
  isArtifactContentEditable,
  listVisibleStructuredFields,
  listVisibleTopFields,
} from './artifactFieldCatalog';
import { listArtifactReviewTimeline } from './artifactReviewTimeline';
import { formatActorRef } from './srsEmptyAudit';
import { kindChipClass, statusBadgeClass, isTechFocusKind, techFocusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';

const inputClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60';
const textareaClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60';

function artifactServerStamp(artifact) {
  return `${String(artifact?.updatedAt || '')}|${String(artifact?.version ?? 1)}`;
}

/**
 * Detail / edit panel for AnalysisArtifact (Wave 3 form + Wave 4 related + Wave 5 audit + DEC R1–R4).
 */
export default function ArtifactDetailPanel({
  artifact,
  kind,
  canEdit = false,
  saving = false,
  transitioning = false,
  nextStatus = null,
  canRequestChanges = false,
  canReject = false,
  relatedItems = [],
  relatedLoading = false,
  onClose,
  onCancel,
  onSave,
  onTransition,
  onOpenRelated,
  /** When true, fields are read-only (side peek). Edit happens in Modal. */
  viewOnly = false,
}) {
  const { t } = useAppStrings();
  const catalog = useMemo(() => getArtifactFieldCatalog(kind), [kind]);
  const contentEditable =
    !viewOnly && canEdit && isArtifactContentEditable(artifact?.status);
  const artifactId = String(artifact?.id || artifact?._id || '');
  const serverStamp = artifactServerStamp(artifact);
  const visibleStructured = useMemo(
    () => listVisibleStructuredFields(kind, artifact),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, artifactId, serverStamp, artifact?.structured]
  );
  const visibleTop = useMemo(
    () => listVisibleTopFields(kind, artifact),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, artifactId, serverStamp, artifact?.title, artifact?.summary, artifact?.body]
  );
  const reviewTimeline = useMemo(() => listArtifactReviewTimeline(artifact), [artifact]);
  const baseline = useMemo(
    () => buildArtifactFormState(artifact, kind),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifactId, serverStamp, kind]
  );

  const [form, setForm] = useState(baseline);
  const [noteDialog, setNoteDialog] = useState(null);
  const dirtyRef = useRef(false);
  const artifactIdRef = useRef(artifactId);

  useEffect(() => {
    const switched = artifactIdRef.current !== artifactId;
    artifactIdRef.current = artifactId;
    // Đổi artifact → hydrate lại. Cùng artifact + stamp mới: chỉ sync khi form sạch
    // (tránh refetch/focus làm mất edit đang gõ → nút Lưu không sáng).
    if (switched || !dirtyRef.current) {
      setForm(baseline);
    }
  }, [baseline, artifactId]);

  const dirtyBody = useMemo(
    () => buildArtifactUpdateBody(form, baseline, kind),
    [form, baseline, kind]
  );
  const isDirty = Object.keys(dirtyBody).length > 0;
  dirtyRef.current = isDirty;
  const canSave =
    contentEditable &&
    isDirty &&
    !saving &&
    !transitioning &&
    Boolean(String(form.top.title || '').trim());

  const setTop = (key, value) => {
    setForm((prev) => ({ ...prev, top: { ...prev.top, [key]: value } }));
  };
  const setStructured = (key, value) => {
    setForm((prev) => ({
      ...prev,
      structured: { ...prev.structured, [key]: value },
    }));
  };

  const renderField = (field, value, onChange) => {
    const label = t(field.labelKey);
    const disabled = !contentEditable || saving;
    if (field.control === 'textarea') {
      return (
        <label key={field.key} className="block">
          <span className="text-xs text-muted-foreground">{label}</span>
          <textarea
            className={textareaClass}
            rows={field.rows || 3}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    }
    return (
      <label key={field.key} className="block">
        <span className="text-xs text-muted-foreground">{label}</span>
        <input
          className={inputClass}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.control === 'tags' ? t('workspace.phase1FieldTagsHint') : undefined}
        />
      </label>
    );
  };

  const legacyNoCatalog = !catalog;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={kindChipClass(kind)}>{kind}</span>
            {isTechFocusKind(kind) ? (
              <span className={techFocusBadgeClass()} title={t('workspace.phase1TechFocusHint')}>
                {t('workspace.phase1TechFocusBadge')}
              </span>
            ) : null}
            <p className="font-mono text-[11px] text-muted-foreground">{artifact?.externalKey}</p>
            {Array.isArray(artifact?.structured?.evidenceIds) &&
            artifact.structured.evidenceIds.length > 0 ? (
              <span
                className="rounded border border-emerald-600/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:text-emerald-100"
                title={artifact.structured.evidenceIds.join(', ')}
              >
                {t('requirements.phase1HasEvidence') || 'Có evidence'}
              </span>
            ) : null}
            {artifact?.structured?.groundingStatus === 'fail' ? (
              <span className="rounded border border-amber-600/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:text-amber-100">
                {t('requirements.phase1Ungrounded') || 'Ungrounded'}
              </span>
            ) : artifact?.structured?.groundingStatus === 'pass' ? (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('requirements.phase1Grounded') || 'Grounded'}
              </span>
            ) : null}
          </div>
          <h2 className="truncate text-sm font-semibold">{form.top.title || artifact?.title}</h2>
          <span
            className={`mt-1 ${statusBadgeClass(artifact?.status)}`}
            title={t('workspace.phase1ArtifactDraftVerHint', {
              version: artifact?.version || 1,
            })}
          >
            {formatPhase1StatusLabel(artifact?.status, t)} ·{' '}
            {t('workspace.phase1CurrentVersion', { version: artifact?.version || 1 })}
          </span>
          {!contentEditable && canEdit ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {String(artifact?.status) === 'approved'
                ? t('workspace.phase1ApprovedUseCrHint')
                : t('workspace.phase1EditOnlyDraftHint')}
            </p>
          ) : null}
          {contentEditable && isDirty ? (
            <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
              {t('workspace.phase1UnsavedChanges')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-border px-2 py-0.5 text-xs"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          {t('common.close')}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {contentEditable ? (
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            <p>{t('workspace.phase1DraftFixHint')}</p>
            <p className="mt-1">{t('workspace.phase1ValidateVsHitlHint')}</p>
          </div>
        ) : null}
        {!contentEditable && String(artifact?.status) === 'approved' ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-2.5 text-[11px] text-amber-950 dark:text-amber-100">
            <p className="font-semibold">{t('workspace.phase1ApprovedLockedTitle')}</p>
            <p className="mt-1">{t('workspace.phase1ApprovedUseCrHint')}</p>
          </div>
        ) : null}

        <div className="rounded-lg border border-border p-2.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            {t('workspace.phase1RelatedTitle')}
          </p>
          {relatedItems.length ? (
            <ul className="mt-1.5 space-y-1">
              {relatedItems.map((item) => {
                const canOpen = Boolean(onOpenRelated) && !item.unresolved && item.id;
                const meta = [
                  item.kind,
                  item.linkType,
                  item.source === 'key' ? t('workspace.phase1RelatedViaKey') : null,
                  item.unresolved ? t('workspace.phase1RelatedUnresolved') : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`flex w-full flex-col rounded-md border border-transparent px-1.5 py-1 text-left ${
                        canOpen
                          ? 'hover:border-border hover:bg-muted/50 cursor-pointer'
                          : 'cursor-default opacity-80'
                      }`}
                      disabled={!canOpen}
                      onClick={() => canOpen && onOpenRelated?.(item)}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.externalKey || item.id}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {item.title || t('workspace.phase1RelatedNoTitle')}
                      </span>
                      {meta ? (
                        <span className="text-[10px] text-muted-foreground">{meta}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : relatedLoading ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('workspace.phase1RelatedEmpty')}</p>
          )}
        </div>

        {(visibleTop.length
          ? visibleTop
          : [
              { key: 'title', labelKey: 'workspace.phase1ColTitle', control: 'input' },
              { key: 'summary', labelKey: 'workspace.phase1Summary', control: 'textarea', rows: 3 },
            ]
        ).map((field) =>
          renderField(field, form.top[field.key] ?? '', (v) => setTop(field.key, v))
        )}

        {catalog ? (
          <div className="space-y-3 rounded-lg border border-border p-2.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              {t('workspace.phase1StructuredFields')}
            </p>
            {visibleStructured.map((field) =>
              renderField(field, form.structured[field.key] ?? '', (v) => setStructured(field.key, v))
            )}
          </div>
        ) : legacyNoCatalog ? (
          <p className="text-xs text-muted-foreground">{t('workspace.phase1LegacyEditHint')}</p>
        ) : null}

        <div className="rounded-lg border border-border p-2.5">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            {t('workspace.phase1VersionHistory')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('workspace.phase1CurrentVersion', { version: artifact?.version || 1 })}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('workspace.phase1ArtifactDraftVerHint', { version: artifact?.version || 1 })}
          </p>
          {artifact?.updatedAt || artifact?.createdAt ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('workspace.phase1UpdatedAt', {
                date: String(artifact?.updatedAt || artifact?.createdAt || ''),
              })}
              {formatActorRef(artifact?.updatedBy || artifact?.createdBy)
                ? ` · ${t('workspace.phase1UpdatedBy', {
                    by: formatActorRef(artifact?.updatedBy || artifact?.createdBy),
                  })}`
                : null}
            </p>
          ) : null}
          {artifact?.createdAt &&
          artifact?.updatedAt &&
          String(artifact.createdAt) !== String(artifact.updatedAt) ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('workspace.phase1CreatedAt', { date: String(artifact.createdAt) })}
              {formatActorRef(artifact?.createdBy)
                ? ` · ${t('workspace.phase1UpdatedBy', {
                    by: formatActorRef(artifact.createdBy),
                  })}`
                : null}
            </p>
          ) : null}

          <p className="mt-2 text-[10px] font-semibold uppercase text-muted-foreground">
            {t('workspace.phase1ReviewTimelineTitle')}
          </p>
          <ul className="mt-1 space-y-1">
            {reviewTimeline.map((row) => (
              <li key={row.gate} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{t(row.labelKey)}</span>
                {': '}
                {row.stamp.done
                  ? [
                      row.stamp.at ? t('workspace.phase1ReviewGateAt', { date: row.stamp.at }) : null,
                      row.stamp.actorRef
                        ? t('workspace.phase1UpdatedBy', { by: row.stamp.actorRef })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('workspace.phase1ReviewGatePending')}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {contentEditable || nextStatus || canRequestChanges || canReject ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-[#FAFAFA] px-4 py-3 dark:bg-slate-900/50">
          {contentEditable ? (
            <>
              <button
                type="button"
                className="rounded-full border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm text-[#595959] hover:bg-[#FAFAFA] disabled:opacity-50"
                disabled={saving || transitioning}
                onClick={() => {
                  if (typeof onCancel === 'function') onCancel();
                  else setForm(baseline);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                  canSave
                    ? 'border border-[#1677FF] bg-white text-[#1677FF] hover:bg-[#E6F4FF]'
                    : 'border border-[#D9D9D9] bg-white text-[#BFBFBF]'
                }`}
                disabled={!canSave}
                onClick={() => {
                  if (!canSave || !dirtyBody || !Object.keys(dirtyBody).length) return;
                  onSave?.(dirtyBody);
                }}
                title={
                  isDirty
                    ? t('workspace.phase1UnsavedChanges')
                    : t('workspace.phase1ValidateVsHitlHint')
                }
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-full border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm text-[#595959] hover:bg-[#FAFAFA]"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          )}
          {canRequestChanges && onTransition ? (
            <button
              type="button"
              className="rounded-full border border-orange-400/60 bg-white px-4 py-1.5 text-sm text-orange-800 dark:text-orange-200 disabled:opacity-50"
              disabled={saving || transitioning || isDirty}
              onClick={() =>
                setNoteDialog({
                  variant: 'request_changes',
                  toStatus: 'changes_requested',
                  title: t('workspace.phase1RequestChangesTitle'),
                  description: t('workspace.phase1RequestChangesDescription'),
                  placeholder: t('workspace.phase1RequestChangesPlaceholder'),
                  submitLabel: t('workspace.phase1RequestChanges'),
                })
              }
            >
              {t('workspace.phase1RequestChanges')}
            </button>
          ) : null}
          {canReject && onTransition ? (
            <button
              type="button"
              className="rounded-full border border-destructive/40 bg-white px-4 py-1.5 text-sm text-destructive disabled:opacity-50"
              disabled={saving || transitioning || isDirty}
              onClick={() =>
                setNoteDialog({
                  variant: 'reject',
                  toStatus: 'rejected',
                  title: t('workspace.phase1RejectTitle'),
                  description: t('workspace.phase1RejectDescription'),
                  placeholder: t('workspace.phase1ImportSetRejectNotePlaceholder'),
                  submitLabel: t('workspace.phase1ConfirmReject'),
                })
              }
            >
              {t('workspace.phase1Reject')}
            </button>
          ) : null}
          {nextStatus && onTransition ? (
            <button
              type="button"
              className="rounded-full bg-[#1677FF] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0958D9] disabled:opacity-50"
              disabled={saving || transitioning || isDirty}
              title={
                isDirty
                  ? t('workspace.phase1SaveBeforeApproveHint')
                  : t('workspace.phase1ValidateVsHitlHint')
              }
              onClick={() => onTransition(nextStatus)}
            >
              {transitioning
                ? t('common.saving')
                : String(artifact?.status) === 'draft'
                  ? t('workspace.phase1SubmitForReview')
                  : String(artifact?.status) === 'changes_requested'
                    ? t('workspace.phase1ResubmitReview')
                    : t('workspace.phase1Approve')}
            </button>
          ) : null}
        </div>
      ) : null}

      <ReviewNoteDialog
        isOpen={Boolean(noteDialog)}
        onClose={() => setNoteDialog(null)}
        variant={noteDialog?.variant || 'generic'}
        title={noteDialog?.title || ''}
        description={noteDialog?.description || ''}
        placeholder={noteDialog?.placeholder || ''}
        submitLabel={noteDialog?.submitLabel}
        onSubmit={(note) => {
          if (!noteDialog?.toStatus || !onTransition) return;
          onTransition(noteDialog.toStatus, note);
        }}
      />
    </div>
  );
}
