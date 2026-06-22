/**
 * P2-Edge — static smoke (configs + docs)
 * node tests/p2-nginx-edge.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const devHttps = read('devops/nginx/dev-https.conf');
const stagingEdge = read('devops/nginx/staging-swarm-edge.conf');
const clientEnv = read('client/.env');
const gwEnv = read('api-gateway/.env');

assert.ok(devHttps.includes('voicehub.local'), 'dev-https.conf must use voicehub.local');
assert.ok(devHttps.includes('/socket.io/'), 'dev-https must proxy socket.io');
assert.ok(devHttps.includes('/voice-socket/'), 'dev-https must proxy voice-socket');
assert.ok(stagingEdge.includes('voicehub.local'), 'staging-swarm-edge must use voicehub.local');
assert.ok(stagingEdge.includes('/voice-socket/'), 'staging-swarm-edge must proxy voice-socket');
assert.ok(read('devops/swarm/staging-nginx-edge.md').includes('TRUST_PROXY'));

assert.ok(/TRUST_PROXY=1/.test(gwEnv), 'api-gateway/.env TRUST_PROXY=1');
assert.ok(/VITE_API_URL=\/api/.test(clientEnv), 'client VITE_API_URL=/api');
assert.ok(/VITE_SOCKET_USE_GATEWAY=true/.test(clientEnv), 'client VITE_SOCKET_USE_GATEWAY=true');
assert.ok(/VITE_HMR_HOST=voicehub.local/.test(clientEnv), 'client VITE_HMR_HOST');
assert.ok(/VITE_HMR_PROTOCOL=wss/.test(clientEnv), 'client VITE_HMR_PROTOCOL=wss');
assert.ok(/VITE_HMR_CLIENT_PORT=443/.test(clientEnv), 'client VITE_HMR_CLIENT_PORT=443');

const docs = [
  'docs/lan-https-voicehub.local.md',
  'devops/nginx/verify-lan-https.ps1',
  'devops/nginx/verify-lan-https.sh',
  'devops/swarm/run-p2-nginx-edge-smoke.sh',
];
for (const d of docs) {
  assert.ok(fs.existsSync(path.join(root, d)), `missing ${d}`);
}

console.log('p2-nginx-edge.smoke.js: OK');
