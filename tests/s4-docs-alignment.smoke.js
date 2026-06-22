/**
 * S4c — docs alignment smoke
 * node tests/s4-docs-alignment.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const arch = read('ARCHITECTURE.md');
assert.ok(arch.includes('Docker Swarm'), 'ARCHITECTURE must document Swarm');
assert.ok(arch.includes('CHAT_SOCKET_ENABLED=false'));
assert.ok(!arch.includes('Kubernetes / orchestrator khác; gateway'), 'ARCHITECTURE must not imply K8s as current path');

const mig = read('MIGRATION.md');
assert.ok(mig.includes('chat-system-service') && mig.includes('không'));
assert.ok(mig.includes('Docker Swarm'));
assert.ok(mig.includes('Consul/Eureka'));

const spec = read('docs/spec-pack/01-SYSTEM-SPEC.md');
assert.ok(spec.includes('socket-service'));
assert.ok(!spec.includes('Song song 2 realtime channel'));
assert.ok(spec.includes('docker-stack.yml'));

const master = read('.cursor/plans/stabilization/00-master-index.plan.md');
assert.ok(master.includes('Stabilization sign-off'));
assert.ok(master.includes('pass'));

console.log('s4-docs-alignment.smoke.js: OK');
