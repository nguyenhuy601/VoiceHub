import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAppStrings } from '../../locales/appStrings';
import { NETWORK_STATE } from '../../lib/network/networkController';

/**
 * Thin strip under chrome when browser/API connectivity is OFFLINE or RECONNECTING.
 */
export default function NetworkOfflineBanner() {
  const { t } = useAppStrings();
  const { state, isOffline } = useNetworkStatus();

  if (state === NETWORK_STATE.ONLINE) return null;

  const message =
    state === NETWORK_STATE.RECONNECTING
      ? t('api.networkReconnecting')
      : t('api.networkOffline');

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-center text-xs font-medium ${
        isOffline
          ? 'bg-amber-600/90 text-white'
          : 'bg-sky-700/90 text-white'
      }`}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
