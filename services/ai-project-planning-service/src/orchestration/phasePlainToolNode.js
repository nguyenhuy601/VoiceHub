/**
 * Hybrid A — plain tools via LangGraph prebuilt ToolNode.
 * Pattern B sec/FR stay Send → named subgraphs (see ADR-toolnode-hybrid-a.md).
 */

const { ToolNode } = require('@langchain/langgraph/prebuilt');
const { Command } = require('@langchain/langgraph');
const { tool } = require('@langchain/core/tools');
const { AIMessage, ToolMessage, isBaseMessage } = require('@langchain/core/messages');
const { z } = require('zod');
const { CANONICAL_ORDER: HOW_CANONICAL } = require('./howToolDag');
const { CANONICAL_ORDER: WHAT_CANONICAL } = require('./whatToolDag');
const { HOW_SEC_TOOL_NAMES } = require('./toolSubgraphAdapter');
const { WHAT_FR_TOOL, WHAT_SECTION_TOOLS } = require('../whatSecs/sectionCatalog');
const {
  lastAiMessage,
  executeHowToolCall,
  executeWhatToolCall,
} = require('./toolSelectNodes');

const PLAIN_TOOLS_NODE = 'plainTools';

const WHAT_SECTION_NAMES = new Set(WHAT_SECTION_TOOLS.map((s) => s.toolName));

const PASS_THROUGH_ARGS = z.object({}).passthrough();

/**
 * Plain tool names for a phase (not Pattern B sec/FR/section).
 * @param {'what'|'how'} phase
 * @returns {string[]}
 */
function listPlainToolNames(phase) {
  if (phase === 'how') {
    return HOW_CANONICAL.filter((name) => !HOW_SEC_TOOL_NAMES.includes(name));
  }
  return WHAT_CANONICAL.filter(
    (name) => name !== WHAT_FR_TOOL && !WHAT_SECTION_NAMES.has(name)
  );
}

/**
 * @param {object|null} msg
 * @returns {Array<{ id?: string, name?: string, toolName?: string, args?: object, arguments?: object, type?: string }>}
 */
function toolCallsFromMessage(msg) {
  if (!msg) return [];
  const raw = msg.tool_calls || msg.toolCalls || [];
  return Array.isArray(raw) ? raw : [];
}

/**
 * Normalize last assistant (plain object or BaseMessage) to AIMessage with optional call filter.
 * @param {object|null} msg
 * @param {{ filterNames?: Set<string>|string[]|null }} [opts]
 * @returns {import('@langchain/core/messages').AIMessage|null}
 */
function normalizeAssistantAiMessage(msg, opts = {}) {
  if (!msg) return null;
  let calls = toolCallsFromMessage(msg);
  const filter = opts.filterNames;
  if (filter) {
    const allow = filter instanceof Set ? filter : new Set(filter);
    calls = calls.filter((c) => allow.has(c.name || c.toolName));
  }
  const normalizedCalls = calls.map((c, i) => ({
    id: String(c.id || `call_${c.name || c.toolName || i}`),
    name: String(c.name || c.toolName || ''),
    args:
      c.args && typeof c.args === 'object'
        ? c.args
        : c.arguments && typeof c.arguments === 'object'
          ? c.arguments
          : {},
    type: 'tool_call',
  }));

  if (isBaseMessage(msg) && msg.getType?.() === 'ai') {
    return new AIMessage({
      content: msg.content ?? '',
      tool_calls: normalizedCalls,
      additional_kwargs: msg.additional_kwargs || {},
      response_metadata: msg.response_metadata || {},
      id: msg.id,
    });
  }

  return new AIMessage({
    content: msg.content ?? (normalizedCalls.length ? `calling ${normalizedCalls.length} tool(s)` : ''),
    tool_calls: normalizedCalls,
  });
}

/**
 * Split last AI tool_calls into plain vs pattern-B names.
 * @param {object} state
 * @param {'what'|'how'} phase
 * @param {{ patternBNames?: Set<string>|string[] }} [extra]
 */
function partitionToolCallsForHybrid(state, phase, extra = {}) {
  const plainSet = new Set(listPlainToolNames(phase));
  const patternB =
    extra.patternBNames instanceof Set
      ? extra.patternBNames
      : new Set(extra.patternBNames || []);
  const ai = lastAiMessage(state?.messages);
  const calls = toolCallsFromMessage(ai);
  const plainCalls = [];
  const patternBCalls = [];
  for (const call of calls) {
    const name = call.name || call.toolName;
    if (!name) continue;
    if (plainSet.has(name)) plainCalls.push(call);
    else if (patternB.has(name) || !plainSet.has(name)) {
      // Known Pattern B, or any non-plain registered name left to caller filter
      if (patternB.size === 0 || patternB.has(name)) patternBCalls.push(call);
    }
  }
  return { plainCalls, patternBCalls, ai, plainSet };
}

function resolveToolCallId(runtime, toolName) {
  if (runtime?.toolCallId) return String(runtime.toolCallId);
  const ai = lastAiMessage(runtime?.state?.messages);
  const call = toolCallsFromMessage(ai).find((c) => (c.name || c.toolName) === toolName);
  return String(call?.id || `plain_${toolName}`);
}

function toToolMessages(executeOut, toolName, toolCallId) {
  const rows = Array.isArray(executeOut?.messages) ? executeOut.messages : [];
  if (!rows.length) {
    return [
      new ToolMessage({
        content: JSON.stringify({ ok: true, toolName }),
        tool_call_id: toolCallId,
        name: toolName,
      }),
    ];
  }
  return rows.map((m, i) => {
    if (isBaseMessage(m) && m.getType?.() === 'tool') return m;
    return new ToolMessage({
      content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? m),
      tool_call_id: m?.tool_call_id || m?.toolCallId || (i === 0 ? toolCallId : `${toolCallId}_${i}`),
      name: m?.name || toolName,
    });
  });
}

function buildLcPlainTools(phase, onProgress) {
  const names = listPlainToolNames(phase);
  const execute = phase === 'how' ? executeHowToolCall : executeWhatToolCall;

  return names.map((toolName) =>
    tool(
      async (args, runtime) => {
        const state = runtime?.state || {};
        const toolCallId = resolveToolCallId(runtime, toolName);
        const out = await execute(state, toolName, args && typeof args === 'object' ? args : {}, {
          onProgress,
        });
        const update = {
          messages: toToolMessages(out, toolName, toolCallId),
        };
        if (out.toolResults != null) update.toolResults = out.toolResults;
        if (out.history != null) update.history = out.history;
        if (out.container != null) update.container = out.container;
        // WHAT section/FR fields if ever routed as plain
        if (out.srsProposal != null) update.srsProposal = out.srsProposal;
        if (out.proposalFragment != null) update.proposalFragment = out.proposalFragment;
        if (out.engineResultsById != null) update.engineResultsById = out.engineResultsById;
        if (out.semanticStatuses != null) update.semanticStatuses = out.semanticStatuses;
        if (out.frUnderstanding != null) update.frUnderstanding = out.frUnderstanding;
        if (out.currentToolName != null) update.currentToolName = out.currentToolName;
        return new Command({ update });
      },
      {
        name: toolName,
        description: `${phase} plain tool ${toolName}`,
        schema: PASS_THROUGH_ARGS,
      }
    )
  );
}

/**
 * Graph node: run ToolNode for plain tool_calls only.
 * @param {{ phase: 'what'|'how', onProgress?: Function }} hooks
 */
function buildPlainToolsNode(hooks = {}) {
  const phase = hooks.phase === 'how' ? 'how' : 'what';
  const onProgress = hooks.onProgress || null;
  const plainSet = new Set(listPlainToolNames(phase));
  const lcTools = buildLcPlainTools(phase, onProgress);
  const toolNode = new ToolNode(lcTools);

  return async function plainToolsNode(state) {
    if (!plainSet.size || !lcTools.length) return {};

    const ai = lastAiMessage(state.messages);
    const plainAi = normalizeAssistantAiMessage(ai, { filterNames: plainSet });
    if (!plainAi || !toolCallsFromMessage(plainAi).length) return {};

    // ToolNode requires BaseMessage[] — pass only the filtered AIMessage (it reads last tool_calls).
    // Full phase state remains on `state` for ToolRuntime; parent already holds prior messages.
    const input = {
      ...state,
      messages: [plainAi],
    };

    return toolNode.invoke(input);
  };
}

module.exports = {
  PLAIN_TOOLS_NODE,
  listPlainToolNames,
  normalizeAssistantAiMessage,
  partitionToolCallsForHybrid,
  toolCallsFromMessage,
  buildPlainToolsNode,
  buildLcPlainTools,
};
