/**
 * Wait until network leaves OFFLINE (or abort).
 * Used by poll loops — does not replay skipped polls.
 */

import { NETWORK_STATE } from './networkController.js';

/**
 * @param {{
 *   controller: { getState: () => string, subscribe: (fn: Function) => () => void },
 *   signal?: AbortSignal,
 * }} opts
 */
export function waitWhileOffline(opts) {
  const { controller, signal } = opts;
  if (controller.getState() !== NETWORK_STATE.OFFLINE) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('aborted');
      err.code = 'NETWORK_WAIT_ABORTED';
      reject(err);
      return;
    }

    let unsub = () => {};

    const onAbort = () => {
      unsub();
      signal?.removeEventListener?.('abort', onAbort);
      const err = new Error('aborted');
      err.code = 'NETWORK_WAIT_ABORTED';
      reject(err);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    unsub = controller.subscribe((state) => {
      if (state !== NETWORK_STATE.OFFLINE) {
        unsub();
        signal?.removeEventListener?.('abort', onAbort);
        resolve();
      }
    });

    if (controller.getState() !== NETWORK_STATE.OFFLINE) {
      unsub();
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }
  });
}

/**
 * Sleep that also yields when going offline mid-wait (then waits until back).
 * @param {number} ms
 * @param {{
 *   controller: object,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function sleepRespectingOffline(ms, opts) {
  const { controller, signal } = opts;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (signal?.aborted) {
      const err = new Error('aborted');
      err.code = 'NETWORK_WAIT_ABORTED';
      throw err;
    }
    if (controller.getState() === NETWORK_STATE.OFFLINE) {
      await waitWhileOffline({ controller, signal });
      return;
    }
    const slice = Math.min(200, end - Date.now());
    if (slice <= 0) break;
    await new Promise((r) => setTimeout(r, slice));
  }
}
