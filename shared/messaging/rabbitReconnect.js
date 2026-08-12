/**
 * P1-Rabbit-B — Minimal AMQP consumer reconnect loop
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAmqpClose(conn) {
  return new Promise((resolve) => {
    if (!conn) {
      resolve();
      return;
    }
    conn.once('close', resolve);
  });
}

/**
 * @param {string} label
 * @param {() => Promise<null|undefined|void>} startFn — return null to stop permanently
 * @param {{ delayMs?: number, shouldRun?: () => boolean }} [options]
 */
async function runWithReconnect(label, startFn, options = {}) {
  const delayMs = options.delayMs ?? 5000;
  const shouldRun = options.shouldRun ?? (() => true);

  while (shouldRun()) {
    try {
      const skip = await startFn();
      if (skip === null) {
        return;
      }
    } catch (err) {
      console.error(`[${label}] session error:`, err?.message || err);
    }
    if (!shouldRun()) {
      break;
    }
    await sleep(delayMs);
  }
}

module.exports = {
  sleep,
  waitForAmqpClose,
  runWithReconnect,
};
