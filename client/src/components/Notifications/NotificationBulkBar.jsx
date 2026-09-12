import { CheckCheck, CheckSquare, Trash2, X } from 'lucide-react';

export default function NotificationBulkBar({
  selectedCount = 0,
  totalVisible = 0,
  onSelectAll,
  onClear,
  onMarkRead,
  onDelete,
  labels = {},
}) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2"
      role="region"
      aria-label={labels.regionAria}
    >
      <span className="text-[0.8125rem] font-semibold text-foreground">
        {labels.selectedCount || `${selectedCount}`}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {selectedCount < totalVisible ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="inline-flex h-8 items-center gap-1 rounded-lg border-none bg-muted px-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            {labels.selectAll}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onMarkRead}
          className="inline-flex h-8 items-center gap-1 rounded-lg border-none bg-primary px-2.5 text-xs font-semibold text-primary-foreground"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          {labels.markRead}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-8 items-center gap-1 rounded-lg border-none bg-destructive/10 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {labels.delete}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground hover:bg-muted"
          aria-label={labels.clear}
          title={labels.clear}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
