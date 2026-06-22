/**
 * S4b — client API contract smoke (pagination, task mode, auth refresh, legacy sunset)
 * node tests/s4-api-pagination-client.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const dmSvc = read('client/src/services/dmMessageService.js');
assert.ok(!dmSvc.includes('params.page ='), 'dmMessageService must not set legacy page');
assert.ok(dmSvc.includes('pageToken'));

const useDm = read('client/src/hooks/queries/useDmConversation.js');
assert.ok(!useDm.includes('page:'), 'useDmConversation must not send page');

const useOrg = read('client/src/hooks/queries/useOrgChannelMessages.js');
assert.ok(!useOrg.includes('params.page ='), 'useOrgChannelMessages must not send legacy page');
assert.ok(useOrg.includes('pageToken'));

const useNotif = read('client/src/hooks/queries/useNotificationsInfinite.js');
assert.ok(useNotif.includes('before'), 'notifications must use before cursor');

const taskApi = read('client/src/services/api/taskAPI.js');
assert.ok(taskApi.includes("|| 'workspace'"), 'taskAPI default mode workspace');

const apiJs = read('client/src/services/api.js');
assert.ok(apiJs.includes('tryRefreshAndRetry'), 'api.js must auto-refresh on 401');

const authSvc = read('client/src/services/authService.js');
assert.ok(authSvc.includes('refreshToken'), 'authService refresh uses refreshToken body');

const legacy = read('client/src/components/Layout/LegacyWorkspaceRedirect.jsx');
assert.ok(legacy.includes('SUNSET'), 'LegacyWorkspaceRedirect must document sunset');

assert.ok(fs.existsSync(path.join(root, 'client/src/utils/authRefresh.js')));

console.log('s4-api-pagination-client.smoke.js: OK');
