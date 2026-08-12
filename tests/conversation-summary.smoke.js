/* eslint-disable no-console */
/**
 * Smoke: conversation summary pipeline (mock LLM).
 *
 *   LLM_PROVIDER=mock node tests/conversation-summary.smoke.js
 */
const assert = require('assert');

async function permissionMapSmoke() {
  const { classifyPermissionRoute, getAction } = require('../api-gateway/src/config/permissions');
  assert.strictEqual(classifyPermissionRoute('POST', '/api/ai/summaries'), 'action');
  assert.strictEqual(getAction('POST', '/api/ai/summaries'), 'chat:write');
  assert.strictEqual(getAction('GET', '/api/ai/summaries/abc123'), 'chat:read');
}

async function messagingConstantsSmoke() {
  const events = require('../shared/messaging/conversationSummaryEvents');
  assert.ok(events.CONVERSATION_SUMMARY_GENERATE_QUEUE);
  assert.ok(events.CONVERSATION_SUMMARY_DLQ_QUEUE);
}

async function promptBuilderSmoke() {
  process.env.LLM_PROVIDER = 'mock';
  const {
    buildSummaryPrompt,
    callOllama,
    safeParseJsonFromOllama,
    normalizeResult,
  } = require('../services/summary-worker/src/promptBuilder');

  const messages = [
    {
      _id: '1',
      senderId: 'u1',
      senderDisplayName: 'Alice',
      content: 'Deadline báo cáo là thứ Sáu',
      createdAt: new Date().toISOString(),
    },
  ];
  const prompt = buildSummaryPrompt({
    messages,
    organizationId: 'org1',
    roomId: 'room1',
  });
  assert.ok(prompt.includes('Alice'));
  const raw = await callOllama(prompt);
  const parsed = safeParseJsonFromOllama(raw);
  const result = normalizeResult(parsed, {
    messageCount: 1,
    firstMessageId: '1',
    lastMessageId: '1',
  });
  assert.ok(result.overview);
  assert.ok(Array.isArray(result.keyPoints));
}

async function run() {
  await permissionMapSmoke();
  await messagingConstantsSmoke();
  await promptBuilderSmoke();
  console.log('conversation-summary.smoke.js: OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
