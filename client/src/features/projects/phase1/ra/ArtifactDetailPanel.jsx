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
import { formatActorRef } from './srsEmptyAudit';

const STATUS_TONE = {
  draft: 'bg-muted text-muted-foreground',
  ba_review: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  tech_review: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  po_review: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  approved: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  rejected: 'bg-destructive/15 text-destructive',
};

const inputClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60';
const textareaClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60';

/**
 * Detail / edit panel for AnalysisArtifact (Wave 3 form + Wave 4 related + Wave 5 audit).
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
          <p className="font-mono text-[11px] text-muted-foreground">{artifact?.externalKey}</p>
          <h2 className="truncate text-sm font-semibold">{form.top.title || artifact?.title}</h2>
          <span
            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[artifact?.status] || STATUS_TONE.draft}`}
            title={t('workspace.phase1ArtifactDraftVerHint', {
              version: artifact?.version || 1,
            })}
          >
            {artifact?.status} · {t('workspace.phase1CurrentVersion', { version: artifact?.version || 1 })}
          </span>
          {!contentEditable && canEdit ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('workspace.phase1EditOnlyDraftHint')}
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
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
