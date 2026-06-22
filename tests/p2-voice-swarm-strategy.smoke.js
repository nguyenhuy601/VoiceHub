/**
 * P2-Voice — stack strategy static smoke
 * node tests/p2-voice-swarm-strategy.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const stack = read('docker-stack.yml');

assert.ok(stack.includes('voice-service:'), 'docker-stack.yml must define voice-service');
assert.ok(
  /VOICE_SERVICE_REPLICAS:-1/.test(stack) || /VOICE_SERVICE_REPLICAS/.test(stack),
  'voice-service must use VOICE_SERVICE_REPLICAS'
);
assert.ok(
  stack.includes('node.labels.voice == true'),
  'voice-service must constrain node.labels.voice'
);

const udpHostBlock = stack.slice(stack.indexOf('voice-service:'));
assert.ok(udpHostBlock.includes('mode: host'), 'voice UDP ports must use mode: host');
assert.ok(udpHostBlock.includes('40000'), 'voice must publish UDP 40000');
assert.ok(udpHostBlock.includes('40010'), 'voice must publish UDP 40010');

const socketBlock = stack.slice(stack.indexOf('socket-service:'));
assert.ok(
  !/socket-service:[\s\S]*?ports:/m.test(socketBlock.split('ollama:')[0] || socketBlock),
  'socket-service must not publish host ports (S2)'
);
assert.ok(socketBlock.includes('expose:'), 'socket-service must use expose only');

const docs = [
  'docs/voice-swarm-scale-strategy.md',
  'devops/swarm/voice-staging-smoke.md',
  'devops/swarm/run-p2-voice-smoke.sh',
];
for (const d of docs) {
  assert.ok(fs.existsSync(path.join(root, d)), `missing ${d}`);
}

const strategy = read('docs/voice-swarm-scale-strategy.md');
assert.ok(strategy.includes('VOICE_SERVICE_REPLICAS'), 'strategy doc must document replica decision');
assert.ok(strategy.includes('40000'), 'strategy doc must document UDP port range');

console.log('p2-voice-swarm-strategy.smoke.js: OK');
