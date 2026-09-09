import { useEffect, useRef, useState } from 'react';
import { MousePointerClick, RefreshCcw, Trash2, X } from 'lucide-react';
import { classifyListStatusBucket, listsForStatusSelect } from './projectHubUtils';

function statusOptionClass(bucket) {
  if (bucket === 'done') return 'bg-primary text-primary-foreground';
  if (bucket === 'progress') return 'bg-primary/80 text-primary-foreground';
  return 'bg-muted text-foreground';
}

function statusBucketLabel(bucket, t) {
  if (bucket === 'done') return t('workspace.projectHubBacklogStatusDone');
  if (bucket === 'progress') return t('workspace.projectHubBacklogStatusProgress');
  return t('workspace.projectHubBacklogStatusTodo');
}

/**
 * Thanh bulk khi tick work item — Change status + Delete.
 */
export default function ProjectHubListBulkBar({
  selectedCount = 0,
  lists = [],
  busy = false,
  canChangeStatus = false,
  canDelete = false,
  t,
  onSelectAll,
  onClear,
  onChangeStatus,
  onDelete,
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [listId, setListId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    if (!statusOpen) return undefined;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) {
        setStatusOpen(false);
        setSubmitted(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [statusOpen]);

  if (selectedCount < 1) return null;

  const missingStatus = submitted && !listId;
  const listOptions = listsForStatusSelect(lists);

  const submitStatus = () => {
    setSubmitted(true);
    if (!listId || busy) return;
    onChangeStatus?.(listId);
    setStatusOpen(false);
    setSubmitted(false);
    setListId('');
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-3 sm:bottom-16">
      <div
        className="pointer-events-auto relative flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-surface px-2 py-1.5 text-foreground shadow-lg"
        role="toolbar"
        aria-label={t('workspace.projectHubListBulkSelected', { n: selectedCount })}
      >
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">
          {t('workspace.projectHubListBulkSelected', { n: selectedCount })}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onSelectAll}
        >
          <MousePointerClick size={14} aria-hidden />
          {t('workspace.projectHubListBulkSelectAll')}
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <div ref={popRef} className="relative">
          <button
            type="button"
            disabled={busy || !canChangeStatus}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-expanded={statusOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setStatusOpen((v) => !v);
              setSubmitted(false);
            }}
          >
            <RefreshCcw size={14} aria-hidden />
            {t('workspace.projectHubListBulkChangeStatus')}
          </button>
          {statusOpen ? (
            <div
              role="dialog"
              className="absolute bottom-full left-1/2 z-40 mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border bg-surface p-3 shadow-lg"
            >
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                {t('workspace.projectHubListBulkChangeStatus')}
              </label>
              <select
                className="w-full rounded-md border border-primary bg-background px-2 py-1.5 text-sm text-foreground outline-none"
                value={listId}
                aria-invalid={missingStatus}
                aria-required="true"
                disabled={busy}
                onChange={(e) => {
                  setListId(e.target.value);
                  setSubmitted(false);
                }}
              >
                <option value="">{t('workspace.projectHubListBulkStatusPh')}</option>
                {listOptions.map((list) => {
                  const id = String(list._id || list.id || '');
                  const bucket = classifyListStatusBucket(list);
                  return (
                    <option key={id} value={id} className={statusOptionClass(bucket)}>
                      {list.title || statusBucketLabel(bucket, t)}
                    </option>
                  );
                })}
              </select>
              {missingStatus ? (
                <p className="mt-1 text-[11px] font-semibold text-destructive" role="alert">
                  {t('workspace.projectHubListBulkStatusRequired')}
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                  onClick={() => {
                    setStatusOpen(false);
                    setSubmitted(false);
                    setListId('');
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={busy || !listId}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  onClick={submitStatus}
                >
                  {t('workspace.projectHubListBulkStatusSubmit')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || !canDelete}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden />
          {t('workspace.projectHubListBulkDelete')}
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t('workspace.projectHubListBulkCloseAria')}
          onClick={onClear}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
