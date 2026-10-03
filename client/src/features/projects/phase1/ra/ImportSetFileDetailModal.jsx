import { Copy, Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Shared/Modal';
import { useAppStrings } from '../../../../locales/appStrings';
import { statusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function docClassLabel(docClass, t) {
  const key = String(docClass || '').toLowerCase();
  if (key.includes('raw')) return t('workspace.phase1DocClassRaw');
  if (key.includes('analysis')) return t('workspace.phase1DocClassAnalysis');
  return String(docClass || '—').toUpperCase();
}

/**
 * Popup chi tiết 1 file Import Set — path MinIO / metadata (không hiện trên list).
 */
export default function ImportSetFileDetailModal({
  open,
  file = null,
  busy = false,
  onClose,
  onDownload,
}) {
  const { t } = useAppStrings();
  if (!open || !file) return null;

  const storageKey = String(file.storageKey || '').trim();

  const onCopyPath = async () => {
    if (!storageKey || !navigator?.clipboard?.writeText) {
      toast.error(t('workspace.phase1FileLibraryPathMissing'));
      return;
    }
    try {
      await navigator.clipboard.writeText(storageKey);
      toast.success(t('workspace.phase1FilePathCopied'));
    } catch {
      toast.error(t('workspace.phase1FileLibraryDownloadFail'));
    }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        className="rounded-lg border border-[#D9D9D9] bg-white px-3.5 py-2 text-sm text-[#595959] hover:bg-[#FAFAFA]"
        onClick={onClose}
        disabled={busy}
      >
        {t('common.close')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDownload?.(file)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0958D9] disabled:opacity-50"
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy ? t('common.loading') : t('workspace.phase1FileLibraryDownload')}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('workspace.phase1FileDetailTitle')}
      size="sm"
      footer={footer}
      closable={!busy}
      headerClassName="items-start border-[#C9DFF0] bg-[#E8F4FC] dark:border-slate-700 dark:bg-slate-800/80"
      titleClassName="min-w-0 flex-1 pr-2 text-base font-semibold sm:text-base"
      bodyClassName="space-y-3 px-5 py-4"
      panelClassName="max-w-lg"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#91CAFF] bg-[#E8F4FC] text-[#1677FF]">
          <FileSpreadsheet className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-[#262626] dark:text-white">
            {file.filename || '—'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-[#D9D9D9] bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#595959]">
              {docClassLabel(file.docClass, t)}
            </span>
            <span className="text-[11px] text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
            {file.setStatus ? (
              <span className={statusBadgeClass(file.setStatus)}>
                {formatPhase1StatusLabel(file.setStatus, t)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid gap-2.5 rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] p-3.5 dark:border-slate-700 dark:bg-slate-900/50">
        {file.createdAt ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
              {t('workspace.phase1FileFieldUploadedAt')}
            </dt>
            <dd className="mt-0.5 text-sm text-[#262626] dark:text-slate-100">
              {new Date(file.createdAt).toLocaleString()}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#8C8C8C]">
            {t('workspace.phase1FileLibraryPathLabel')}
          </dt>
          {storageKey ? (
            <dd className="mt-1">
              <code className="block break-all rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#434343] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
                {storageKey}
              </code>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#D9D9D9] bg-white px-2 py-1 text-[11px] font-medium text-[#595959] hover:bg-[#FAFAFA]"
                onClick={() => void onCopyPath()}
              >
                <Copy className="h-3 w-3" aria-hidden />
                {t('workspace.phase1FileCopyPath')}
              </button>
            </dd>
          ) : (
            <dd className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
              {t('workspace.phase1FileLibraryPathMissing')}
            </dd>
          )}
        </div>
      </dl>
    </Modal>
  );
}
