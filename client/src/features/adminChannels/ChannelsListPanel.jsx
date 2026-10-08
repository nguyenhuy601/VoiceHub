import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminDenseMobileList,
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
import useAdminChannels from '../../hooks/useAdminChannels';
import { useAppStrings } from '../../locales/appStrings';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

const CHANNEL_TYPE_KEYS = { text: 'adminChannels.typeText', voice: 'adminChannels.typeVoice' };

function channelTypeLabel(type, t) {
  const key = CHANNEL_TYPE_KEYS[String(type || '').toLowerCase()];
  if (key) return t(key);
  return type || '—';
}

export default function ChannelsListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { channels, loading, error, loadChannels } = useAdminChannels(orgId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((row) => {
      const id = unitId(row);
      return (
        unitName(row).toLowerCase().includes(q) ||
        String(row._scopeName || '').toLowerCase().includes(q) ||
        String(row.type || '').toLowerCase().includes(q) ||
        id.toLowerCase().includes(q)
      );
    });
  }, [channels, query]);

  return (
    <AdminUserPanelShell title={t('adminDomains.channels.list')} hint={t('adminChannels.listHint')} wide>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('adminChannels.searchPlaceholder')}
            aria-label={t('adminChannels.searchPlaceholder')}
            className={`${adminInputClass()} pl-9`}
          />
        </div>
      </div>

      <AdminDenseTableCard>
        {loading ? (
          <AdminListSkeleton className="p-4" />
        ) : error ? (
          <AdminLoadErrorState className="px-4 py-6" message={error} onRetry={() => loadChannels()} />
        ) : (
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={filtered}
              getKey={unitId}
              ariaLabel={t('adminDomains.channels.list')}
              renderTitle={(row) => unitName(row)}
              renderMeta={(row) => [row._scopeName || '—', channelTypeLabel(row.type, t)].join(' · ')}
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <th className="px-4 py-3">{t('adminChannels.colName')}</th>
                  <th className="px-4 py-3">{t('adminChannels.colScope')}</th>
                  <th className="px-4 py-3">{t('adminChannels.colType')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={unitId(row)} className={adminDenseRowClass()}>
                    <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row._scopeName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{channelTypeLabel(row.type, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <AdminEmptyState message={t('adminChannels.noChannels')} /> : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </AdminUserPanelShell>
  );
}
