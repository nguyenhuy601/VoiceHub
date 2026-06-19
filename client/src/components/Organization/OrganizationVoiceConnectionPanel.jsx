import { PhoneOff } from 'lucide-react';

/**
 * Thanh trạng thái voice trên sidebar tổ chức — Figma voice tokens.
 */
export default function OrganizationVoiceConnectionPanel({
  isDarkMode,
  t,
  connected = false,
  channelLabel = '',
  orgName = '',
  onDisconnect,
}) {
  const path = [channelLabel, orgName].filter(Boolean).join(' / ');
  const statusText = connected ? t('orgPanel.voiceConnectedNow') : t('orgPanel.voiceConnecting');

  return (
    <div
      className={`mx-2 mb-2 mt-1 shrink-0 rounded-xl border px-3 py-2.5 shadow-sm ${
        isDarkMode
          ? 'border-white/10 bg-surface-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold leading-tight ${
              connected
                ? 'text-success'
                : isDarkMode
                  ? 'text-muted-foreground'
                  : 'text-slate-600'
            }`}
          >
            {statusText}
          </p>
          {path ? (
            <p className={`mt-0.5 truncate text-[11px] ${isDarkMode ? 'text-muted-foreground' : 'text-slate-500'}`}>
              {path}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          title={t('orgPanel.voiceDisconnect')}
          aria-label={t('orgPanel.voiceDisconnect')}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
            isDarkMode
              ? 'bg-white/[0.06] text-muted-foreground hover:bg-white/10 hover:text-foreground'
              : 'bg-muted text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <PhoneOff className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
