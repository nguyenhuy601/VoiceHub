import { ShieldAlert } from 'lucide-react';
import useUiRole from '../../hooks/useUiRole';
import { useShellLayout } from '../../context/ShellLayoutContext';
import { useAppStrings } from '../../locales/appStrings';

export default function ShellRoleBanner() {
  const { openJoinModal } = useShellLayout();
  const { t } = useAppStrings();

  const { isGuest, isPersonal } = useUiRole();

  if (!isGuest && !isPersonal) return null;

  if (isGuest) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-5 py-1.5">
        <ShieldAlert size={13} className="shrink-0 text-muted-foreground" />
        <span className="text-[0.7812rem] text-muted-foreground">
          <strong className="text-foreground-secondary">
            {t('uiRole.guestAccount')}
          </strong>
          {' '}
          {`— ${t('uiRole.guestLimitedHint')}`}
        </span>
        <span className="ml-auto shrink-0 rounded bg-muted px-2 py-0.5 text-[0.65rem] font-bold tracking-wider text-muted-foreground">
          {t('uiRole.guestAccessBadge')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-primary/10 bg-primary/5 px-5 py-1.5">
      <span className="text-[0.6875rem] text-primary/80">
        {t('uiRole.personalNoticePrefix')} <strong>{t('uiRole.personalNoticeStrong')}</strong>. {t('uiRole.personalNoticeSuffix')}
      </span>
      <button
        type="button"
        onClick={openJoinModal}
        className="ml-auto shrink-0 rounded-[5px] border border-primary/25 bg-primary/15 px-2.5 py-0.5 text-[0.7rem] font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
      >
        {t('uiRole.joinOrganization')}
      </button>
    </div>
  );
}
