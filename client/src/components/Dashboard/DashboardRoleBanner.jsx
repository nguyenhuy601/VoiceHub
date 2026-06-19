import { Users } from 'lucide-react';
import { FIGMA_DASH_ROLE_BANNER, FIGMA_DASH_ROLE_ICON } from './figmaDashboardClasses';
import { useAppStrings } from '../../locales/appStrings';

export default function DashboardRoleBanner({ isGuest }) {
  const { t } = useAppStrings();
  return (
    <div
      className={`${FIGMA_DASH_ROLE_BANNER} ${
        isGuest ? 'border border-slate-400/20 bg-slate-400/[0.08]' : 'border border-primary/20 bg-primary/[0.08]'
      }`}
    >
      <div className={`${FIGMA_DASH_ROLE_ICON} ${isGuest ? 'bg-slate-400/15' : 'bg-primary/[0.12]'}`}>
        <Users size={16} className={isGuest ? 'text-slate-400' : 'text-primary'} />
      </div>
      <div>
        <div className={`text-[0.8125rem] font-semibold ${isGuest ? 'text-slate-400' : 'text-primary'}`}>
          {isGuest ? t('uiRole.guestSessionLabel') : t('uiRole.personalAccountLabel')}
        </div>
        <div className="text-[0.7rem] text-muted-foreground">
          {isGuest
            ? t('uiRole.guestSessionHint')
            : t('uiRole.personalDashboardHint')}
        </div>
      </div>
    </div>
  );
}
