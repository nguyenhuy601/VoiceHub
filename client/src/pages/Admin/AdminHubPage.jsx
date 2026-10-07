import { useMemo } from 'react';
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
  KeyRound,
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
import { getVisibleAdminDomains } from '../../config/adminDomainsConfig';
import AdminInsightTicker from '../../components/Admin/AdminInsightTicker';
import useAdminHubInsights from '../../hooks/useAdminHubInsights';
import { useAppStrings } from '../../locales/appStrings';
import { useCompanyAdminContext } from './CompanyAdminLayout';

const DOMAIN_ICONS = {
  Users,
  KeyRound,
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
  const { memberCount, orgId, isFullAccess } = useCompanyAdminContext();
  const { loading, messages, pendingCount, usersHref } = useAdminHubInsights(orgId);
  const domains = useMemo(() => getVisibleAdminDomains(isFullAccess), [isFullAccess]);

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-1 sm:px-0">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('adminDomains.hubTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminDomains.hubSubtitle')}</p>
      </div>

      <AdminInsightTicker
        loading={loading}
        messages={messages}
        href={pendingCount > 0 ? usersHref : ''}
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {domains.map((domain) => {
          const Icon = DOMAIN_ICONS[domain.icon] || LayoutGrid;
          return (
            <Link
              key={domain.id}
              to={domain.path}
              className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <Icon size={18} aria-hidden />
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

      <div className="rounded-xl border border-dashed border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
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
