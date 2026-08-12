/* eslint-disable no-console */
const assert = require('assert');
const {
  classifyPermissionRoute,
  AUDITED_CLIENT_API_PATHS,
  getAction,
} = require('../api-gateway/src/config/permissions');

function run() {
  for (const [method, path] of AUDITED_CLIENT_API_PATHS) {
    const kind = classifyPermissionRoute(method, path);
    assert.notStrictEqual(
      kind,
      'unmapped',
      `expected mapped policy for ${method} ${path}, got unmapped`
    );
  }

  assert.strictEqual(classifyPermissionRoute('GET', '/api/messages'), 'action');
  assert.strictEqual(getAction('GET', '/api/messages'), 'chat:read');
  assert.strictEqual(classifyPermissionRoute('GET', '/api/messages/unread/org'), 'action');
  assert.strictEqual(classifyPermissionRoute('PATCH', '/api/documents/doc-1'), 'action');
  assert.strictEqual(classifyPermissionRoute('GET', '/api/voice/calls/foo'), 'action');
  assert.strictEqual(getAction('GET', '/api/voice/calls/foo'), 'voice:read');
  assert.strictEqual(classifyPermissionRoute('GET', '/api/organizations/org-1/shell'), 'action');

  assert.strictEqual(classifyPermissionRoute('GET', '/api/evil/unknown'), 'unmapped');
  assert.strictEqual(classifyPermissionRoute('POST', '/api/internal-backdoor'), 'unmapped');

  assert.strictEqual(classifyPermissionRoute('GET', '/api/bootstrap'), 'no_permission');
  assert.strictEqual(classifyPermissionRoute('GET', '/api/tasks'), 'task_bypass');

  console.log('gateway-permission-map.smoke.js: OK');
}

run();
