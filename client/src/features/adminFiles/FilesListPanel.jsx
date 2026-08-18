import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminDocuments from '../../hooks/useAdminDocuments';
import { useAppStrings } from '../../locales/appStrings';
import { adminQueryHubLink } from '../../utils/adminHubLinks';

const FILE_OPS_HUB = '/app/admin/files/ops';
const ACTION_LINKS = [
  { tab: 'restore', labelKey: 'adminDomains.files.restore' },
  { tab: 'export', labelKey: 'adminDomains.files.export' },
  { tab: 'delete', labelKey: 'adminDomains.files.delete' },
];

export default function FilesListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { documents, loading, error, loadDocuments } = useAdminDocuments(orgId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((row) => {
      return (
        String(row.name || '').toLowerCase().includes(q) ||
        String(row.mimeType || '').toLowerCase().includes(q) ||
        String(row._id || '').toLowerCase().includes(q)
      );
    });
  }, [documents, query]);

  return (
    <AdminUserPanelShell title={t('adminDomains.files.list')} hint={t('adminFiles.listHint')} wide>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminFiles.searchPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <div className="space-y-3 px-4 py-6">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadDocuments()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{t('adminFiles.colName')}</th>
                  <th className="px-4 py-3">{t('adminFiles.colType')}</th>
                  <th className="px-4 py-3">{t('adminFiles.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row._id} className="border-b border-border/50 transition hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.mimeType || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ACTION_LINKS.map((link) => (
                          <Link
                            key={link.tab}
                            to={adminQueryHubLink(FILE_OPS_HUB, { fileId: row._id }, link.tab)}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                          >
                            {t(link.labelKey)}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('adminFiles.noFiles')}</p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
