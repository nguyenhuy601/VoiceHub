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
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#FFD591] bg-[#FFF7E6] px-3 py-2.5 dark:border-amber-700 dark:bg-amber-950/50">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[#AD6800] dark:text-amber-200">
          {title}
        </p>
        {dirty ? (
          <p className="text-[10px] text-[#D48806] dark:text-amber-300/90">● Chưa lưu</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-full border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm text-[#595959] hover:bg-[#FAFAFA] disabled:opacity-50"
          disabled={saving || transitioning}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${
            canSave
              ? 'border border-[#1677FF] bg-white text-[#1677FF] hover:bg-[#E6F4FF]'
              : 'border border-[#D9D9D9] bg-white text-[#BFBFBF]'
          }`}
          disabled={!canSave}
          onClick={onSave}
        >
          {saving ? savingLabel : saveLabel}
        </button>
        {nextStatus && onSubmitReview ? (
          <button
            type="button"
            className="rounded-full bg-[#1677FF] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0958D9] disabled:opacity-50"
            disabled={saving || transitioning || dirty}
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
