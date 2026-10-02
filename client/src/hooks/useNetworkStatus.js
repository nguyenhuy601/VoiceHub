import { useSyncExternalStore } from 'react';
import {
  ensureNetworkControllerStarted,
  networkController,
} from '../lib/network/networkController.js';

ensureNetworkControllerStarted();

function subscribe(cb) {
  return networkController.subscribe(cb);
}

function getSnapshot() {
  return networkController.getState();
}

/**
 * @returns {{
 *   state: string,
 *   isOnline: boolean,
 *   isOffline: boolean,
 *   shouldPausePolling: boolean,
 * }}
 */
export function useNetworkStatus() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    state,
    isOnline: state === 'ONLINE',
    isOffline: state === 'OFFLINE',
    shouldPausePolling: state === 'OFFLINE',
  };
}

export default useNetworkStatus;
