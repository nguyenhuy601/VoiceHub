import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileDown, Eye, CheckCircle2 } from 'lucide-react';

import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApiData } from '../../utils/helpers';
import {
  AdminUserPanelShell,
  AdminUserFormCard,
  adminInputClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

const TERMINAL = new Set(['completed', 'failed']);
const POLL_MS = 1500;
const POLL_MAX_MS = 15 * 60 * 1000;

function statusPill(status, errorMessage) {
  const s = String(status || '').toLowerCase();
  if (s === 'ok' || s === 'compensated') {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
        OK
      </span>
    );
  }
  if (s === 'pending') {
    return (
      <span className="inline-flex rounded-full bg-sky-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-500/20 dark:text-sky-200">
        Pending
      </span>
    );
  }
  if (s === 'failed') {
    return (
      <span className="text-sm text-red-500" title={errorMessage || ''}>
        Failed
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{s || '—'}</span>;
}

function toastValidationDetails(error, t) {
  const data = error?.response?.data || error?.data || {};
  const details = Array.isArray(data.details) ? data.details : [];
  const detailMsg = details
    .slice(0, 5)
    .map((d) => `Dòng ${d.rowNumber || '?'}: ${d.message || d.errorCode || ''}`)
    .filter(Boolean)
    .join(' · ');
  toast.error(
    detailMsg ||
      resolveApiErrorMessage(error, { t, fallback: t('adminUsers.hrExcelPreviewFail') })
  );
  return details;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function UserExcelImportPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(null);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [previewBatchId, setPreviewBatchId] = useState('');

  const reportRows = useMemo(() => (batch?.rows && Array.isArray(batch.rows) ? batch.rows : []), [batch]);
  const canConfirm =
    Boolean(previewBatchId) &&
    previewErrors.length === 0 &&
    String(batch?.status || '') === 'preview';

  const downloadTemplate = async () => {
    if (!orgId || busy) return;
    try {
      const res = await organizationAPI.downloadImportTemplate(orgId);
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res.data || res], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        let msg = 'Không tải được template';
        try {
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resource_import.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: 'Không tải được template' }));
    }
  };

  const refreshBatch = async (batchId) => {
    const statusRes = await organizationAPI.getImportBatchStatus(orgId, batchId);
    const statusBody = unwrapApiData(statusRes) || statusRes;
    const data = statusBody?.data || statusBody;
    setBatch(data);
    return data;
  };

  const pollUntilDone = async (batchId) => {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < POLL_MAX_MS) {
      last = await refreshBatch(batchId);
      const st = String(last?.status || '').toLowerCase();
      if (TERMINAL.has(st)) return last;
      await sleep(POLL_MS);
    }
    return last;
  };

  const runPreview = async () => {
    if (!orgId || !file || busy) return;
    setBusy(true);
    setPreviewErrors([]);
    setPreviewBatchId('');
    setBatch(null);
    try {
      const res = await organizationAPI.previewMembersExcel(orgId, file);
      const out = unwrapApiData(res) || res;
      const data = out?.data || out;
      const batchId = data?.batchId || '';
      if (!batchId) {
        toast.error(t('adminUsers.hrExcelPreviewFail'));
        return;
      }
      setPreviewBatchId(batchId);
      const status = await refreshBatch(batchId);
      toast.success(
        t('adminUsers.hrExcelPreviewOk', { count: status?.totalRows || data?.totalRows || 0 })
      );
    } catch (error) {
      const details = toastValidationDetails(error, t);
      setPreviewErrors(details);
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!orgId || !previewBatchId || busy) return;
    if (!canConfirm) {
      toast.error(t('adminUsers.hrExcelConfirmNeedPreview'));
      return;
    }
    setBusy(true);
    try {
      const res = await organizationAPI.confirmMembersExcel(orgId, previewBatchId);
      const out = unwrapApiData(res) || res;
      const data = out?.data || out;
      const batchId = data?.batchId || previewBatchId;

      toast.success(t('adminUsers.hrExcelQueued'));

      let status = await refreshBatch(batchId);
      const st0 = String(status?.status || data?.status || '').toLowerCase();
      if (!TERMINAL.has(st0)) {
        status = await pollUntilDone(batchId);
      }

      const st = String(status?.status || '').toLowerCase();
      if (st === 'completed') toast.success(t('adminUsers.hrExcelDone'));
      else if (st === 'failed') toast.error(t('adminUsers.hrExcelFailedRollback'));
      else toast.error(t('adminUsers.hrExcelFailed'));

      setPreviewBatchId('');
    } catch (error) {
      toastValidationDetails(error, t);
      if (previewBatchId) {
        try {
          await refreshBatch(previewBatchId);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const progressLabel = (() => {
    const st = String(batch?.status || '');
    if (st === 'queued' || st === 'importing') {
      return t('adminUsers.hrExcelImporting', {
        processed: batch?.processedRows ?? 0,
        total: batch?.totalRows ?? 0,
      });
    }
    if (batch?.totalRows != null) {
      return t('adminUsers.hrExcelProgress', {
        processed: batch.processedRows ?? 0,
        total: batch.totalRows,
      });
    }
    return null;
  })();

  const body = (
    <>
      <AdminUserFormCard>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className={adminInputClass() + ' cursor-pointer'}>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setPreviewBatchId('');
                  setPreviewErrors([]);
                  setBatch(null);
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {file ? String(file.name) : t('adminUsers.chooseHrExcelFile')}
                </span>
                <Upload className="h-4 w-4" />
              </div>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              disabled={busy}
              onClick={downloadTemplate}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {t('adminUsers.downloadHrTemplate')}
            </button>
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              disabled={busy || !file}
              onClick={runPreview}
            >
              <Eye className="mr-2 h-4 w-4" />
              {busy ? t('common.saving') : t('adminUsers.previewHrExcel')}
            </button>
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={busy || !canConfirm}
              onClick={runConfirm}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {busy ? t('common.saving') : t('adminUsers.confirmHrExcel')}
            </button>
          </div>

          {previewErrors.length > 0 ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
              <p className="mb-2 font-semibold">{t('adminUsers.hrExcelPreviewFail')}</p>
              <ul className="list-inside list-disc space-y-1 text-xs">
                {previewErrors.slice(0, 20).map((d) => (
                  <li key={`${d.rowNumber}-${d.message}`}>
                    Dòng {d.rowNumber || '?'}: {d.message || d.errorCode}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </AdminUserFormCard>

      {batch ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                Batch: <span className="font-mono">{String(batch._id || batch.batchId || previewBatchId || '')}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Status: {String(batch.status || '—')}
                {progressLabel ? ` · ${progressLabel}` : null}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">{t('adminUsers.importNameCol')}</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">{t('adminUsers.importPastProjectsCol')}</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">{t('adminUsers.importEmailCol')}</th>
                  <th className="px-4 py-3">{t('adminUsers.importActivationCol')}</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {reportRows.map((r) => (
                  <tr key={`${r.rowNumber}-${r.email}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.rowNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {r.fullName || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.email}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {Array.isArray(r.pastProjectNames) && r.pastProjectNames.length
                        ? `${r.pastProjectNames.length}: ${r.pastProjectNames.join(', ')}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">{statusPill(r.status, r.errorMessage)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {r.status === 'ok'
                        ? r.emailSent
                          ? t('adminUsers.importEmailSent')
                          : t('adminUsers.importEmailPending')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {r.status === 'ok'
                        ? r.pendingActivation
                          ? t('adminUsers.importActivationPending')
                          : t('adminUsers.importActivationReady')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-red-600">
                      {r.status === 'failed' ? r.errorMessage : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.users.modeExcel')} hint={t('adminUsers.hrExcelHint')}>
      {body}
    </AdminUserPanelShell>
  );
}
