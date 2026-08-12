/**
 * S2 — chat-service không bind Socket.IO khi CHAT_SOCKET_ENABLED=false (mặc định).
 * Chạy: node tests/chat-socket-canonical.smoke.js
 */
const assert = require('assert');

function isChatSocketEnabled(envValue) {
  const raw = String(envValue ?? 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

assert.strictEqual(isChatSocketEnabled(undefined), false);
assert.strictEqual(isChatSocketEnabled('false'), false);
assert.strictEqual(isChatSocketEnabled('0'), false);
assert.strictEqual(isChatSocketEnabled('true'), true);
assert.strictEqual(isChatSocketEnabled('1'), true);
assert.strictEqual(isChatSocketEnabled(' yes '), true);

const fs = require('fs');
const path = require('path');
const serverJs = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'chat-service', 'src', 'server.js'),
  'utf8'
);
assert.ok(serverJs.includes('CHAT_SOCKET_ENABLED'), 'server.js must gate Socket.IO on CHAT_SOCKET_ENABLED');
assert.ok(serverJs.includes('isChatSocketEnabled'), 'server.js must define isChatSocketEnabled');

const namespaceJs = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'socket-service', 'src', 'socket', 'chat.namespace.js'),
  'utf8'
);
assert.ok(namespaceJs.includes("socket.on('room:join'"), 'socket-service must handle room:join');
assert.ok(namespaceJs.includes("socket.on('room:typing_start'"), 'socket-service must handle room:typing_start');

const socketCtx = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'src', 'context', 'SocketContext.jsx'),
  'utf8'
);
assert.ok(
  !/['"`]https?:\/\/[^'"`]*:3006/.test(socketCtx),
  'SocketContext must not use :3006 as socket base URL'
);
assert.ok(socketCtx.includes('/chat'), 'SocketContext must use /chat namespace');

console.log('chat-socket-canonical.smoke.js: OK');
