import { useAppStrings } from '../../locales/appStrings';

export default function OverviewPanel({ memberCount = 0, onSelectTab }) {
  const { t } = useAppStrings();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('companyAdmin.tabOverview')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('companyAdmin.overviewHint')}</p>
      <button
        type="button"
        onClick={() => onSelectTab('people')}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40"
      >
        <div className="text-2xl font-bold">{memberCount}</div>
        <div className="text-sm text-muted-foreground">{t('companyAdmin.activeMembers')}</div>
      </button>
    </div>
  );
}
