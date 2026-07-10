import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { findAdminNavItem } from '../../config/adminDomainsConfig';
import { useAppStrings } from '../../locales/appStrings';

export default function AdminModulePlaceholderPage() {
  const { t } = useAppStrings();
  const location = useLocation();

  const match = useMemo(() => findAdminNavItem(location.pathname), [location.pathname]);

  const domainTitle = match ? t(match.domain.labelKey) : t('adminDomains.hubTitle');
  const featureTitle = match ? t(match.item.labelKey) : '—';

  const siblingFeatures = useMemo(() => {
    if (!match) return [];
    const section = match.domain.sections.find((s) => s.id === match.section.id);
    return section?.items || [];
  }, [match]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-border bg-card/50 p-6 md:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Construction size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-400/90">{domainTitle}</p>
            <h2 className="mt-1 text-xl font-bold">{featureTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('adminDomains.comingSoonHint')}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
            {t('adminDomains.comingSoon')}
          </span>
        </div>

        {siblingFeatures.length > 0 ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t('adminDomains.featureScope')}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {siblingFeatures.map((item) => {
                const active = match?.item.id === item.id;
                return (
                  <li
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      active
                        ? 'border-red-500/40 bg-red-500/10 font-medium text-foreground'
                        : 'border-border/80 bg-background/40 text-muted-foreground'
                    }`}
                  >
                    {t(item.labelKey)}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
