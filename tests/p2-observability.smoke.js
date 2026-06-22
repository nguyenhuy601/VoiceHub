/**
 * P2-Obs — static smoke
 * node tests/p2-observability.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const required = [
  'devops/scripts/rabbit-queue-depth.sh',
  'devops/swarm/run-p2-observability-baseline.sh',
  'devops/swarm/observability/docker-compose.observability.yml',
  'devops/swarm/observability/prometheus.yml',
  'devops/swarm/observability/alerts.yml',
  'devops/swarm/observability/export-swarm-metrics.sh',
  'devops/swarm/observability/deploy-observability-stack.sh',
  'docs/phase2-observability-staging.md',
];

for (const f of required) {
  assert.ok(exists(f), `missing ${f}`);
}

const alerts = fs.readFileSync(path.join(root, 'devops/swarm/observability/alerts.yml'), 'utf8');
assert.ok(alerts.includes('> 100'), 'alerts must include AI queue threshold');
assert.ok(alerts.includes('> 200'), 'alerts must include IO worker threshold');

const doc = fs.readFileSync(path.join(root, 'docs/phase2-observability-staging.md'), 'utf8');
assert.ok(doc.includes('voicehub.friend.dm'), 'obs doc must list friend.dm queue');
assert.ok(doc.includes('autoscale-policy'), 'obs doc must link autoscale policy');

console.log('p2-observability.smoke.js: OK');
