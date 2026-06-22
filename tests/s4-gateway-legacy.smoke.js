/**
 * S4a — gateway legacy cleanup smoke
 * node tests/s4-gateway-legacy.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const removed = [
  'api-gateway/src/routes/bootstrap.routes.js',
  'api-gateway/src/routes/dashboard-summary.routes.js',
  'api-gateway/src/services/bootstrap.service.js',
  'api-gateway/src/services/dashboard-summary.service.js',
  'services/chat-service/src/workers/orgAclConsumer.js',
];

for (const rel of removed) {
  assert.ok(!fs.existsSync(path.join(root, rel)), `deprecated file should be removed: ${rel}`);
}

const routesIndex = fs.readFileSync(path.join(root, 'api-gateway/src/routes/index.js'), 'utf8');
assert.ok(routesIndex.includes('publicBffRouter'), 'routes/index must mount BFF only');
assert.ok(!routesIndex.includes('bootstrap.routes'), 'routes/index must not import bootstrap.routes');
assert.ok(!routesIndex.includes('dashboard-summary.routes'));

const bffRoutes = fs.readFileSync(path.join(root, 'api-gateway/src/bff/routes.js'), 'utf8');
assert.ok(bffRoutes.includes("publicBffRouter.get('/api/bootstrap'"));
assert.ok(bffRoutes.includes("publicBffRouter.get('/api/dashboard/summary'"));

const chatServer = fs.readFileSync(path.join(root, 'services/chat-service/src/server.js'), 'utf8');
assert.ok(chatServer.includes('orgEventsConsumer'));
assert.ok(!chatServer.includes('orgAclConsumer'));

function grepDeprecatedMounts(dir) {
  const hits = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!name.endsWith('.js')) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (!text.includes('@deprecated')) continue;
      if (/require\([^)]+\)/.test(text) && text.includes('module.exports')) {
        const importers = [];
        // file is deprecated itself — flag if still required by non-deprecated sibling
        hits.push(path.relative(root, full));
      }
    }
  };
  walk(dir);
  return hits;
}

const gwDeprecated = grepDeprecatedMounts(path.join(root, 'api-gateway/src'));
assert.strictEqual(
  gwDeprecated.length,
  0,
  `api-gateway @deprecated files still present: ${gwDeprecated.join(', ')}`
);

const workerDeprecated = fs
  .readdirSync(path.join(root, 'services/chat-service/src/workers'))
  .filter((f) => {
    const text = fs.readFileSync(path.join(root, 'services/chat-service/src/workers', f), 'utf8');
    return text.includes('@deprecated');
  });
assert.strictEqual(workerDeprecated.length, 0, `chat workers @deprecated: ${workerDeprecated.join(', ')}`);

console.log('s4-gateway-legacy.smoke.js: OK');
