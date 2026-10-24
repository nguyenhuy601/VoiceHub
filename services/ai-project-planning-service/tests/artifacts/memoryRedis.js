/**
 * In-memory Redis for artifact unit tests. Supports GET, SET NX PX, and the lock Lua.
 */

function createMemoryRedis() {
  const kv = new Map();

  function live(key) {
    const row = kv.get(key);
    if (!row) return null;
    if (row.expiresAt != null && row.expiresAt <= Date.now()) {
      kv.delete(key);
      return null;
    }
    return row;
  }

  return {
    async get(key) {
      const row = live(key);
      return row ? row.value : null;
    },
    async set(key, value, ...args) {
      let px = null;
      let nx = false;
      for (let i = 0; i < args.length; i += 1) {
        const flag = String(args[i]).toUpperCase();
        if (flag === 'PX') {
          px = Number(args[i + 1]);
          i += 1;
        } else if (flag === 'NX') nx = true;
      }
      if (nx && live(key)) return null;
      kv.set(key, {
        value: String(value),
        expiresAt: px != null ? Date.now() + px : null,
      });
      return 'OK';
    },
    async eval(script, _numKeys, key, token, px) {
      const row = live(key);
      if (!row || row.value !== String(token)) return 0;
      if (String(script).includes('del')) {
        kv.delete(key);
        return 1;
      }
      if (px != null) row.expiresAt = Date.now() + Number(px);
      return 1;
    },
  };
}

module.exports = { createMemoryRedis };
