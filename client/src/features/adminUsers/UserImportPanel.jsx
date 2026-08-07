import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload } from 'lucide-react';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { parseCsvInviteRows } from '../../utils/adminUserUtils';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

export default function UserImportPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const { loadMembers } = useAdminMembers(orgId);
  const [text, setText] = useState('email,firstName,lastName,role\n');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState([]);

  const runImport = async () => {
    if (!orgId || busy) return;
    const rows = parseCsvInviteRows(text);
    if (!rows.length) {
      toast.error(t('adminUsers.importEmpty'));
      return;
    }
    setBusy(true);
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
    toast.success(t('adminUsers.importDone', { ok: okCount, total: results.length }));
    await loadMembers();
    setBusy(false);
  };

  const body = (
    <>
      <AdminUserFormCard>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${adminInputClass()} font-mono text-xs leading-relaxed`}
        />
        <button type="button" disabled={busy} className={adminPrimaryBtnClass('mt-4')} onClick={runImport}>
          <Upload className="h-3.5 w-3.5" />
          {busy ? t('common.saving') : t('adminUsers.runImport')}
        </button>
      </AdminUserFormCard>
      {report.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">{t('adminUsers.colResult')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.map((row) => (
                <tr key={`${row.email}-${row.ok}`} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">{row.email}</td>
                  <td className="px-4 py-2.5">
                    {row.ok ? (
                      <span className="inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                        {t('adminUsers.importOk')}
                      </span>
                    ) : (
                      <span className="text-sm text-red-500">{row.error}</span>
                    )}
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
