/**
 * Sticky action bar for inline row edit — Hủy · Lưu · Gửi duyệt.
 */
export default function Phase1InlineActionBar({
  title,
  dirty = false,
  canSave = false,
  saving = false,
  transitioning = false,
  nextStatus = null,
  submitLabel,
  onCancel,
  onSave,
  onSubmitReview,
  cancelLabel,
  saveLabel,
  savingLabel,
}) {
  const focusBtn =
    'transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-warning/40 bg-warning/10 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        {dirty ? (
          <p className="text-[10px] text-warning">● Chưa lưu</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={`rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 ${focusBtn}`}
          disabled={saving || transitioning}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${focusBtn} ${
            canSave
              ? 'border border-primary bg-background text-primary hover:bg-primary/5'
              : 'border border-border bg-background text-muted-foreground'
          }`}
          disabled={!canSave}
          aria-busy={saving ? 'true' : undefined}
          onClick={onSave}
        >
          {saving ? savingLabel : saveLabel}
        </button>
        {nextStatus && onSubmitReview ? (
          <button
            type="button"
            className={`rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 ${focusBtn}`}
            disabled={saving || transitioning || dirty}
            aria-busy={transitioning ? 'true' : undefined}
            title={dirty ? 'Lưu trước khi gửi duyệt' : undefined}
            onClick={onSubmitReview}
          >
            {transitioning ? savingLabel : submitLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
