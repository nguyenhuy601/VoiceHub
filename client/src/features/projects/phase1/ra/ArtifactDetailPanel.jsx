import { useEffect, useMemo, useState } from 'react';
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
import { kindChipClass, statusBadgeClass } from '../shared/phase1UiTokens';

const inputClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60';
const textareaClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60';

/**
 * Detail / edit panel for AnalysisArtifact (Wave 3 form + Wave 4 related + Wave 5 audit + DEC R1–R4).
 */
export default function ArtifactDetailPanel({
  artifact,
  kind,
  canEdit = false,
  saving = false,
  relatedItems = [],
  relatedLoading = false,
  onClose,
  onSave,
  onOpenRelated,
}) {
  const { t } = useAppStrings();
  const catalog = useMemo(() => getArtifactFieldCatalog(kind), [kind]);
  const contentEditable = canEdit && isArtifactContentEditable(artifact?.status);
  const artifactId = String(artifact?.id || artifact?._id || '');
  const visibleStructured = useMemo(
    () => listVisibleStructuredFields(kind, artifact),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, artifactId, artifact?.updatedAt, artifact?.version, artifact?.structured]
  );
  const visibleTop = useMemo(
    () => listVisibleTopFields(kind, artifact),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, artifactId, artifact?.updatedAt, artifact?.version, artifact?.title, artifact?.summary, artifact?.body]
  );
  const reviewTimeline = useMemo(() => listArtifactReviewTimeline(artifact), [artifact]);
  const baseline = useMemo(
    () => buildArtifactFormState(artifact, kind),
    // reset when switching artifact or server data version
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifactId, artifact?.updatedAt, artifact?.version, kind]
  );

  const [form, setForm] = useState(baseline);

  useEffect(() => {
    setForm(baseline);
  }, [baseline]);

  const dirtyBody = useMemo(
    () => buildArtifactUpdateBody(form, baseline, kind),
    [form, baseline, kind]
  );
  const isDirty = Object.keys(dirtyBody).length > 0;

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
            <p className="font-mono text-[11px] text-muted-foreground">{artifact?.externalKey}</p>
          </div>
          <h2 className="truncate text-sm font-semibold">{form.top.title || artifact?.title}</h2>
          <span
            className={`mt-1 ${statusBadgeClass(artifact?.status)}`}
            title={t('workspace.phase1ArtifactDraftVerHint', {
              version: artifact?.version || 1,
            })}
          >
            {artifact?.status} · {t('workspace.phase1CurrentVersion', { version: artifact?.version || 1 })}
          </span>
          {!contentEditable && canEdit ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {String(artifact?.status) === 'approved'
                ? t('workspace.phase1ApprovedUseCrHint')
                : t('workspace.phase1EditOnlyDraftHint')}
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

      {contentEditable ? (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={!isDirty || saving}
            onClick={() => setForm(baseline)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={!isDirty || saving || !String(form.top.title || '').trim()}
            onClick={() => onSave?.(dirtyBody)}
            title={t('workspace.phase1ValidateVsHitlHint')}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
