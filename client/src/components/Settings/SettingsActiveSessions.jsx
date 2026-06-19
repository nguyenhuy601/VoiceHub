import { Shield } from 'lucide-react';
import { FIGMA_SETTINGS_CARD, FIGMA_SETTINGS_SESSION_ROW } from './figmaSettingsClasses';
import { useAppStrings } from '../../locales/appStrings';

export default function SettingsActiveSessions({
  sessions = [],
  onRevokeSession,
  onRevokeAllOthers,
  title,
  revokeAllLabel,
  revokeLabel,
  currentDeviceLabel,
}) {
  const { t } = useAppStrings();
  const resolvedTitle = title ?? t('settingsPage.sessionsTitle');
  const resolvedRevokeAllLabel = revokeAllLabel ?? t('settingsPage.sessionsRevokeAll');
  const resolvedRevokeLabel = revokeLabel ?? t('settingsPage.sessionsRevoke');
  const resolvedCurrentDeviceLabel = currentDeviceLabel ?? t('settingsPage.sessionsCurrentDevice');

  return (
    <div className={FIGMA_SETTINGS_CARD}>
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="m-0 text-[0.9375rem] font-semibold text-foreground">{resolvedTitle}</h3>
        {onRevokeAllOthers && sessions.some((s) => !s.current) && (
          <button
            type="button"
            onClick={onRevokeAllOthers}
            className="border-none bg-transparent text-xs font-medium text-error hover:underline"
          >
            {resolvedRevokeAllLabel}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settingsPage.sessionsEmpty')}</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`${FIGMA_SETTINGS_SESSION_ROW} ${
                s.current
                  ? 'border-primary/20 bg-primary/[0.05]'
                  : 'border-border bg-background'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  s.current ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Shield size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {s.device}
                  {s.current && (
                    <span className="rounded bg-primary/12 px-1.5 py-px text-[0.6rem] font-bold text-primary">
                      {resolvedCurrentDeviceLabel}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[s.location, s.ip, s.lastSeen].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!s.current && onRevokeSession && (
                <button
                  type="button"
                  onClick={() => onRevokeSession(s.id)}
                  className="shrink-0 rounded-md border border-error/30 bg-transparent px-2.5 py-1 text-xs text-error transition hover:bg-error/5"
                >
                  {resolvedRevokeLabel}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
