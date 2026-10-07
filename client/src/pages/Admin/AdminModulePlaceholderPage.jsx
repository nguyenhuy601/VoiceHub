import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import { findAdminNavItem } from '../../config/adminDomainsConfig';
import { adminSecondaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

export default function AdminModulePlaceholderPage() {
  const { t } = useAppStrings();
  const location = useLocation();

  const match = useMemo(() => findAdminNavItem(location.pathname), [location.pathname]);

  const domainTitle = match ? t(match.domain.labelKey) : t('adminDomains.hubTitle');
  const featureTitle = match ? t(match.item.labelKey) : '—';

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8" role="status">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning">
            <Construction size={22} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{domainTitle}</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{featureTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('adminDomains.comingSoonHint')}</p>
          </div>
          <span className="shrink-0 rounded-full border border-warning bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
            {t('adminDomains.comingSoon')}
          </span>
        </div>
        <div className="mt-6">
          <Link to="/app/admin" className={adminSecondaryBtnClass('focus-visible:ring-offset-2')}>
            <ArrowLeft size={16} aria-hidden />
            {t('adminDomains.backToHub')}
          </Link>
        </div>
      </div>
    </div>
  );
}
