import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Database,
  FolderOpen,
  Hash,
  Kanban,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { ADMIN_DOMAINS } from '../../config/adminDomainsConfig';
import { useAppStrings } from '../../locales/appStrings';
import { useCompanyAdminContext } from './CompanyAdminLayout';

const DOMAIN_ICONS = {
  Users,
  Building2,
  Shield,
  Hash,
  MessageSquare,
  Mic,
  Kanban,
  FolderOpen,
  Bell,
  Sparkles,
  Lock,
  ScrollText,
  Database,
  Settings,
  Activity,
  BarChart3,
};

export default function AdminHubPage() {
  const { t } = useAppStrings();
  const { memberCount } = useCompanyAdminContext();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('adminDomains.hubTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('adminDomains.hubSubtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ADMIN_DOMAINS.map((domain) => {
          const Icon = DOMAIN_ICONS[domain.icon] || LayoutGrid;
          return (
            <Link
              key={domain.id}
              to={domain.path}
              className="group relative rounded-xl border border-border bg-card/60 p-4 transition hover:border-red-500/40 hover:bg-card"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{t(domain.labelKey)}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t('adminDomains.openModule')}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {t('companyAdmin.overviewHint')}{' '}
        <span className="font-medium text-foreground">
          {t('companyAdmin.activeMembers')}: {memberCount}
        </span>
      </div>
    </div>
  );
}

/** Redirect bookmark cũ /app/admin/overview → hub. */
export function AdminOverviewRedirect() {
  return <Navigate to="/app/admin" replace />;
}
