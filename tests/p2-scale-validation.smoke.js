/**
 * P2-Validation — static smoke
 * node tests/p2-scale-validation.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const required = [
  'devops/swarm/run-p2-scale-validation.sh',
  'devops/swarm/run-p2-socket-gateway-ha.sh',
  'docs/ha-baseline-staging-phase2-2026-06.md',
  'devops/swarm/load-chaos-validation.md',
  'devops/swarm/run-p2-gateway-scale-smoke.sh',
  'devops/swarm/run-p2-worker-queue-drain.sh',
  'devops/swarm/run-p2-observability-baseline.sh',
];

for (const f of required) {
  assert.ok(exists(f), `missing ${f}`);
}

const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
assert.ok(/API_GATEWAY_REPLICAS=2/.test(env), '.env API_GATEWAY_REPLICAS=2');

console.log('p2-scale-validation.smoke.js: OK');
