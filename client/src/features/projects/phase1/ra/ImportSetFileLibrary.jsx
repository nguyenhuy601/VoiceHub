/**
 * Import Set file library — compact cards; MinIO path only in detail popup (DEC P1-J).
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, FileSpreadsheet, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { statusBadgeClass, formatPhase1StatusLabel } from '../shared/phase1UiTokens';
import ImportSetFileDetailModal from './ImportSetFileDetailModal';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

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

async function downloadBlobAsFile(blobLike, fileName, failMsg) {
  const blob =
    blobLike instanceof Blob
      ? blobLike
      : new Blob([blobLike?.data ?? blobLike], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
  if (blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let msg = failMsg;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const SECTION_SHELL =
  'overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950';
const SECTION_HEAD =
  'border-b border-[#E8E8E8] bg-[#E8F4FC] px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/80';

export default function ImportSetFileLibrary({ projectId, importSets = [] }) {
  const { t } = useAppStrings();
  const [busyId, setBusyId] = useState('');
  const [detailId, setDetailId] = useState('');

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['customerDocuments', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listCustomerDocuments(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const hasIncompleteDraft = useMemo(
    () =>
      importSets.some(
        (s) =>
          s.status === 'draft' &&
          !(s.rawDocument?.filename || s.rawDocumentId) &&
          !(s.analysisDocument?.filename || s.analysisDocumentId)
      ),
    [importSets]
  );

  const setById = useMemo(() => {
    const map = new Map();
    for (const s of importSets) {
      const id = String(s.id || s._id || '');
      if (id) map.set(id, s);
    }
    return map;
  }, [importSets]);

  const rows = useMemo(() => {
    return docs.map((d) => {
      const setId = String(d.importSetId || '');
      const set = setId ? setById.get(setId) : null;
      const storageKey = String(d.storageKey || '').trim();
      return {
        id: String(d.id || d._id || ''),
        filename: d.filename || '—',
        docClass: d.docClass || 'other',
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt,
        importSetId: setId,
        setStatus: set?.status || '',
        storageKey,
      };
    });
  }, [docs, setById]);

  const detailRow = detailId ? rows.find((r) => r.id === detailId) || null : null;

  const onDownload = useCallback(
    async (row) => {
      if (!projectId || !row?.id || busyId) return;
      setBusyId(row.id);
      try {
        const res = await analysisAPI.downloadCustomerDocument(projectId, row.id);
        await downloadBlobAsFile(
          res,
          row.filename || 'document.xlsx',
          t('workspace.phase1FileLibraryDownloadFail')
        );
        toast.success(t('workspace.phase1FileLibraryDownloadOk'));
      } catch (err) {
        toast.error(resolveApiErrorMessage(err));
      } finally {
        setBusyId('');
      }
    },
    [busyId, projectId, t]
  );

  return (
    <>
      <section className={SECTION_SHELL}>
        <div className={`${SECTION_HEAD} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="flex items-center gap-2 text-xs font-semibold text-[#262626] dark:text-white">
            <FolderOpen size={14} className="text-[#1677FF]" aria-hidden />
            {t('workspace.phase1FileLibraryTitle')}
            {rows.length > 0 ? (
              <span className="font-normal text-muted-foreground">({rows.length})</span>
            ) : null}
          </h2>
        </div>
        <div className="px-3.5 py-3">
          {isLoading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : null}

          {!isLoading && rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
              {hasIncompleteDraft
                ? t('workspace.phase1FileLibraryEmptyDraft')
                : t('workspace.phase1FileLibraryEmpty')}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <div className="flex h-full flex-col rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] p-3 transition hover:border-[#91CAFF] hover:bg-[#E6F4FF]/40 dark:border-slate-700 dark:bg-slate-900/40">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDetailId(row.id)}
                    >
                      <div className="flex items-start gap-2">
                        <FileSpreadsheet
                          size={16}
                          className="mt-0.5 shrink-0 text-[#1677FF]"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-xs font-semibold text-foreground">
                            {row.filename}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="rounded border border-border/70 bg-white px-1 py-px font-medium uppercase dark:bg-slate-950">
                              {docClassLabel(row.docClass, t)}
                            </span>
                            <span>{formatBytes(row.sizeBytes)}</span>
                            {row.setStatus ? (
                              <span className={statusBadgeClass(row.setStatus)}>
                                {formatPhase1StatusLabel(row.setStatus, t)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <span className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-[#1677FF]">
                        {t('workspace.phase1FileOpenDetail')}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </button>
                    <div className="mt-2 flex justify-end border-t border-border/40 pt-2">
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#595959] hover:bg-[#FAFAFA] disabled:opacity-50"
                        onClick={() => void onDownload(row)}
                      >
                        <Download size={12} aria-hidden />
                        {busyId === row.id
                          ? t('common.loading')
                          : t('workspace.phase1FileLibraryDownload')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <ImportSetFileDetailModal
        open={Boolean(detailRow)}
        file={detailRow}
        busy={Boolean(detailId) && busyId === detailId}
        onClose={() => setDetailId('')}
        onDownload={(row) => void onDownload(row)}
      />
    </>
  );
}
