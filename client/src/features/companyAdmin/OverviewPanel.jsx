import { Link } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';

export default function OverviewPanel({
  pendingJoinCount = 0,
  memberCount = 0,
  onSelectTab,
}) {
  const { t } = useAppStrings();

  const cards = [
    {
      key: 'approvals',
      label: t('companyAdmin.pendingJoin'),
      value: pendingJoinCount,
      tab: 'approvals',
    },
    {
      key: 'people',
      label: t('companyAdmin.activeMembers'),
      value: memberCount,
      tab: 'people',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('companyAdmin.tabOverview')}</h2>
      <p className="text-sm text-muted-foreground">{t('companyAdmin.overviewHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelectTab(card.tab)}
            className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40"
          >
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm text-muted-foreground">{card.label}</div>
          </button>
        ))}
      </div>
      <Link
        to="/app/collaborate/approvals"
        className="inline-block text-sm text-primary hover:underline"
      >
        {t('companyAdmin.openApprovalInbox')}
      </Link>
    </div>
  );
}
