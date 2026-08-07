import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileDown } from 'lucide-react';

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

function statusPill(status, errorMessage) {
  const s = String(status || '').toLowerCase();
  if (s === 'ok' || s === 'compensated') {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
        OK
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

export default function UserExcelImportPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(null);

  const reportRows = useMemo(() => (batch?.rows && Array.isArray(batch.rows) ? batch.rows : []), [batch]);

  const downloadTemplate = async () => {
    if (!orgId || busy) return;
    try {
      const res = await organizationAPI.downloadImportTemplate(orgId);
      const blob = res instanceof Blob ? res : new Blob([res.data || res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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

  const runImport = async () => {
    if (!orgId || !file || busy) return;
    setBusy(true);
    try {
      const res = await organizationAPI.importMembersExcel(orgId, file);
      const out = unwrapApiData(res) || res;
      const batchId = out?.batchId || out?.data?.batchId || out?.data?.id || out?.id;

      if (!batchId) {
        toast.error(t('adminUsers.importFailed') || 'Không có batchId trả về');
        return;
      }

      // Backend import này đang xử lý sync, nhưng FE vẫn fetch lại để có rows report.
      const statusRes = await organizationAPI.getImportBatchStatus(orgId, batchId);
      const statusBody = unwrapApiData(statusRes) || statusRes;
      setBatch(statusBody?.data || statusBody);

      const st = String(statusBody?.data?.status || '').toLowerCase();
      if (st === 'completed') toast.success(t('adminUsers.hrExcelDone'));
      else if (st === 'failed') toast.error(t('adminUsers.hrExcelFailedRollback'));
      else toast.success(t('adminUsers.hrExcelDone'));
    } catch (error) {
      const data = error?.response?.data || error?.data || {};
      const details = Array.isArray(data.details) ? data.details : [];
      const detailMsg = details
        .slice(0, 3)
        .map((d) => `Dòng ${d.rowNumber || '?'}: ${d.message || d.errorCode || ''}`)
        .filter(Boolean)
        .join(' · ');
      toast.error(
        detailMsg ||
          resolveApiErrorMessage(error, { t, fallback: t('adminUsers.hrExcelFailed') })
      );
    } finally {
      setBusy(false);
    }
  };

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
            <button type="button" className={adminPrimaryBtnClass()} disabled={busy || !file} onClick={runImport}>
              {busy ? t('common.saving') : t('adminUsers.submitHrExcel')}
            </button>
          </div>
        </div>
      </AdminUserFormCard>

      {batch ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                Batch: <span className="font-mono">{String(batch._id || batch.batchId || '')}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Status: {String(batch.status || '—')}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Email</th>
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
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.email}</td>
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

