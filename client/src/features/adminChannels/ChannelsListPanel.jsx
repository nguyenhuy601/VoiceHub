import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminChannels from '../../hooks/useAdminChannels';
import { useAppStrings } from '../../locales/appStrings';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { adminQueryHubLink } from '../../utils/adminHubLinks';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const CHANNEL_MANAGE_HUB = '/app/admin/channels/manage';
const ACTION_LINKS = [
  { tab: 'edit', labelKey: 'adminDomains.channels.edit', grant: RBAC_GRANT.CHANNEL_UPDATE },
  { tab: 'members', labelKey: 'adminDomains.channels.members', grant: RBAC_GRANT.CHANNEL_UPDATE },
  { tab: 'visibility', labelKey: 'adminDomains.channels.visibility', grant: RBAC_GRANT.CHANNEL_UPDATE },
  { tab: 'transfer', labelKey: 'adminDomains.channels.transfer', grant: RBAC_GRANT.CHANNEL_UPDATE },
  { tab: 'archive', labelKey: 'adminDomains.channels.archive', grant: RBAC_GRANT.CHANNEL_UPDATE },
  { tab: 'restore', labelKey: 'adminDomains.channels.restore', grant: RBAC_GRANT.CHANNEL_UPDATE },
];

export default function ChannelsListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { channels, loading, error, loadChannels } = useAdminChannels(orgId);
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
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
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadChannels()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{t('adminChannels.colName')}</th>
                  <th className="px-4 py-3">{t('adminChannels.colScope')}</th>
                  <th className="px-4 py-3">{t('adminChannels.colType')}</th>
                  <th className="px-4 py-3">{t('adminChannels.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = unitId(row);
                  return (
                    <tr key={id} className="border-b border-border/50 transition hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">{unitName(row)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row._scopeName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.type || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ACTION_LINKS.filter((link) =>
                            canActWithGrant(isFullAccess, hasGrant, link.grant)
                          ).map((link) => (
                            <Link
                              key={link.tab}
                              to={adminQueryHubLink(CHANNEL_MANAGE_HUB, { channelId: id }, link.tab)}
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                            >
                              {t(link.labelKey)}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminChannels.noChannels')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
