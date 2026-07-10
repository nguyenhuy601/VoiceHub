import { useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { parseCsvInviteRows } from '../../utils/adminUserUtils';

export default function UserImportPanel({ orgId }) {
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.users.import')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminUsers.importHint')}</p>
      </div>
      <textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      <GradientButton type="button" disabled={busy} onClick={runImport}>
        {busy ? t('common.saving') : t('adminUsers.runImport')}
      </GradientButton>
      {report.length ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">{t('adminUsers.colResult')}</th>
              </tr>
            </thead>
            <tbody>
              {report.map((row) => (
                <tr key={`${row.email}-${row.ok}`} className="border-t border-border/60">
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">
                    {row.ok ? (
                      <span className="text-emerald-400">{t('adminUsers.importOk')}</span>
                    ) : (
                      <span className="text-red-400">{row.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
