import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Upload } from 'lucide-react';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { CSV_INVITE_MAX_ROWS, parseCsvInvite } from '../../utils/adminUserUtils';
import {
  AdminDenseMobileList,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

function ImportResult({ row, t }) {
  if (row.ok) {
    return (
      <span className="inline-flex rounded-full bg-success-bg px-2.5 py-0.5 text-[11px] font-semibold text-success">
        {t('adminUsers.importOk')}
      </span>
    );
  }
  return <span className="text-sm text-destructive">{row.error}</span>;
}

export default function UserImportPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const { loadMembers } = useAdminMembers(orgId, { view: 'directory' });
  const [text, setText] = useState('email,firstName,lastName,role\n');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState([]);
  const textareaId = useId();

  const runImport = async () => {
    if (!orgId || busy) return;
    const { rows, truncated, downgradedCount } = parseCsvInvite(text);
    if (!rows.length) {
      toast.error(t('adminUsers.importEmpty'));
      return;
    }
    if (truncated) toast(t('adminUsers.importTruncated', { max: CSV_INVITE_MAX_ROWS }));
    if (downgradedCount) toast(t('adminUsers.importRoleDowngraded', { n: downgradedCount }));
    setBusy(true);
    try {
      const results = [];
      for (const row of rows) {
        try {
          await organizationAPI.inviteMemberByEmail(orgId, row);
          results.push({ ...row, ok: true });
        } catch (error) {
          results.push({
            ...row,
            ok: false,
            error: resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.inviteFail') }),
          });
        }
      }
      setReport(results);
      const okCount = results.filter((r) => r.ok).length;
      const summary = t('adminUsers.importDone', { ok: okCount, total: results.length });
      if (okCount === results.length) toast.success(summary);
      else if (okCount === 0) toast.error(summary);
      else toast(summary);
      await loadMembers();
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <AdminUserFormCard>
        <label htmlFor={textareaId} className={adminLabelClass()}>
          {t('adminUsers.importCsvLabel', { max: CSV_INVITE_MAX_ROWS })}
        </label>
        <textarea
          id={textareaId}
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${adminInputClass()} font-mono text-xs leading-relaxed`}
        />
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          className={adminPrimaryBtnClass('mt-4')}
          onClick={runImport}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? t('common.saving') : t('adminUsers.runImport')}
        </button>
      </AdminUserFormCard>
      {report.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <AdminDenseMobileList
            items={report}
            getKey={(row) => `${row.email}-${row.ok}`}
            ariaLabel={t('adminUsers.colResult')}
            renderTitle={(row) => row.email}
            renderMeta={(row) => <ImportResult row={row} t={t} />}
          />
          <table className="hidden min-w-full text-sm md:table">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t('adminUsers.importEmailAddressCol')}</th>
                <th className="px-4 py-3">{t('adminUsers.colResult')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.map((row) => (
                <tr
                  key={`${row.email}-${row.ok}`}
                  className="transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">{row.email}</td>
                  <td className="px-4 py-2.5">
                    <ImportResult row={row} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.users.importCsvTab')} hint={t('adminUsers.importHint')}>
      {body}
    </AdminUserPanelShell>
  );
}
