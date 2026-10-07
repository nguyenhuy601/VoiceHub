import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminInputClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import useAdminDocuments from '../../hooks/useAdminDocuments';
import { useAppStrings } from '../../locales/appStrings';

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
            aria-label={t('adminFiles.searchPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminDenseTableCard>
        {loading ? (
          <AdminListSkeleton className="p-4" />
        ) : error ? (
          <AdminLoadErrorState className="px-4 py-6" message={error} onRetry={() => loadDocuments()} />
        ) : (
          <AdminDenseTableScroll>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminFiles.colName')}</th>
                  <th className="px-4 py-3">{t('adminFiles.colType')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row._id} className={adminDenseRowClass()}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.mimeType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <AdminEmptyState message={t('adminFiles.noFiles')} /> : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
