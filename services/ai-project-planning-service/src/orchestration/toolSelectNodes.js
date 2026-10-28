/**
 * LangGraph tool-select nodes — LLM selects tools via tool_calls; no phase DAG/catalog.
 */

const { invokeTool } = require('../registry/toolRegistry');
const { parseToolCalls } = require('../runtime/intelligenceRuntime');
const { describePhaseToolsForPrompt } = require('./phaseToolManifest');
const {
  isHowSecPhaseOnly,
  isWhatSectionPhaseOnly,
  assertPhaseGraphOnly,
} = require('./phaseGraphOnly');
const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const { resolveAgentBudget, evaluateStopCondition } = require('./agentBudget');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');
const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');
const { buildToolContext, buildToolInput } = require('./runToolsSequence');

function appendMessages(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

function appendList(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

/**
 * Payload for LangGraph `Send` into a tool/FR node.
 * Clears append-list channels so Pattern B compiled subgraphs do not echo
 * parent history/toolResults (and optionally messages) back into parent reducers.
 *
 * @param {object} state
 * @param {{ clearMessages?: boolean }} [opts] — true for subgraph targets that
 *   do not read tool_calls from messages (FR / section sec graphs).
 */
function stateForToolSend(state, opts = {}) {
  const next = {
    ...(state && typeof state === 'object' ? state : {}),
    history: [],
    toolResults: [],
  };
  if (opts.clearMessages) next.messages = [];
  return next;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function sparseContainerPatch(base, next) {
  if (!isPlainObject(next)) return null;
  const patch = {};
  for (const key of Object.keys(next)) {
    if (key === 'jobs') continue;
    const nextVal = next[key];
    const baseVal = base?.[key];
    if (nextVal === baseVal) continue;
    if (key === 'planning' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      const planning = {};
      for (const child of Object.keys(nextVal)) {
        if (nextVal[child] === baseVal[child]) continue;
        planning[child] = nextVal[child];
      }
      if (Object.keys(planning).length) patch.planning = planning;
      continue;
    }
    if (key === 'analyses' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      patch.analyses = { ...baseVal, ...nextVal };
      continue;
    }
    patch[key] = nextVal;
  }
  return Object.keys(patch).length ? patch : null;
}

function describeToolsForPrompt(phase = 'what') {
  return describePhaseToolsForPrompt(phase === 'how' ? 'how' : 'what');
}

function lastAiMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    if (!m) continue;
    // LangChain AIMessage / BaseMessage
    if (typeof m.getType === 'function' && m.getType() === 'ai') return m;
    if (m.role === 'assistant' || m.role === 'ai') return m;
  }
  return null;
}

/**
 * Pure route helper (unit-tested).
 * @returns {'tools'|'assemble'}
 */
function routeAfterSelectTools(state) {
  const stop = String(state?.stopReason || '');
  if (stop.startsWith('BUDGET_')) return 'assemble';
  try {
    const { hasPhaseHardToolStop } = require('./howPhaseToolNodes');
    if (hasPhaseHardToolStop(state)) return 'assemble';
  } catch {
    /* optional at boot */
  }
  const ai = lastAiMessage(state?.messages);
  const calls = ai?.tool_calls || ai?.toolCalls || [];
  if (Array.isArray(calls) && calls.length > 0) return 'tools';
  return 'assemble';
}

function buildAgentPrompt(state, phase, tools) {
  const goal = state.goal || state.currentGoal || (phase === 'what' ? 'Build SRS' : 'Build plan');
  const gap = state.gapReport?.hint || '';
  const done = (Array.isArray(state.toolResults) ? state.toolResults : [])
    .filter((r) => r && !r.error)
    .map((r) => r?.toolName)
    .filter(Boolean);
  const toolLines = tools
    .map((t) => `- ${t.toolName}: ${t.description || ''}`)
    .join('\n');
  const whatRule =
    phase === 'what'
      ? 'WHAT: do NOT set done=true until every listed tool has been executed successfully at least once.\n'
      : '';
  let howRule = '';
  if (phase === 'how') {
    const { HOW_TOOL_DEPENDENCIES, howToolDepsSatisfied, successfulHowTools } = require('./howToolDag');
    const doneSet = successfulHowTools(state);
    const ready = tools
      .map((t) => t.toolName)
      .filter((n) => !doneSet.has(n) && howToolDepsSatisfied(n, doneSet));
    const depLines = Object.entries(HOW_TOOL_DEPENDENCIES)
      .filter(([, deps]) => deps.length)
      .map(([name, deps]) => `  ${name} needs ${deps.join(' + ')}`)
      .join('\n');
    howRule =
      'HOW: never re-call a tool already executed successfully.\n' +
      'HOW soft deps (only call ready tools):\n' +
      `${depLines}\n` +
      `Ready now: ${ready.join(', ') || '(none — set done=true if artifact enough)'}.\n`;
  }
  return (
    `Phase: ${phase}. Goal: ${goal}.\n` +
    `Already executed tools: ${done.join(', ') || '(none)'}.\n` +
    (gap ? `Gap: ${gap}\n` : '') +
    whatRule +
    howRule +
    `Available tools:\n${toolLines}\n\n` +
    `Respond JSON: {"toolCalls":[{"toolName":"...","arguments":{}}],"done":false}\n` +
    `If and only if every required tool already ran (or HOW artifact enough), return {"toolCalls":[],"done":true}.`
  );
}

/**
 * @param {object} state
 * @param {{ phase: string, decideToolCalls?: Function, env?: object }} opts
 */
function whatRequiredToolsStillMissing(state) {
  try {
    const { requiredWhatTools, successfulWhatTools } = require('./artifactCompleteness');
    const done = successfulWhatTools(state);
    return requiredWhatTools().filter((name) => !done.has(name));
  } catch {
    return [];
  }
}

/**
 * Drop WHAT tool_calls already recorded as successful (prevents LLM re-picking e.g. WhatBGTool ×N).
 * @param {object} state
 * @param {Array<{ name?: string, toolName?: string }>} toolCalls
 * @returns {typeof toolCalls}
 */
function filterAlreadySuccessfulWhatToolCalls(state, toolCalls) {
  const list = Array.isArray(toolCalls) ? toolCalls : [];
  if (!list.length) return list;
  let done;
  try {
    const { successfulWhatTools } = require('./artifactCompleteness');
    done = successfulWhatTools(state);
  } catch {
    done = new Set();
  }
  if (!done.size) return list;
  return list.filter((c) => {
    const name = String(c?.name || c?.toolName || '').trim();
    return Boolean(name) && !done.has(name);
  });
}

/**
 * Drop HOW tool_calls already recorded as successful (mirrors WHAT).
 * @param {object} state
 * @param {Array<{ name?: string, toolName?: string }>} toolCalls
 */
function filterAlreadySuccessfulHowToolCalls(state, toolCalls) {
  const list = Array.isArray(toolCalls) ? toolCalls : [];
  if (!list.length) return list;
  const { successfulHowTools } = require('./howToolDag');
  const done = successfulHowTools(state);
  if (!done.size) return list;
  return list.filter((c) => {
    const name = String(c?.name || c?.toolName || '').trim();
    return Boolean(name) && !done.has(name);
  });
}

/**
 * Keep only tool_calls that are currently eligible (no soft-deps rewrite).
 * @param {object} state
 * @param {Array<{ name?: string, toolName?: string }>} toolCalls
 */
function filterHowToolCallsByEligible(state, toolCalls) {
  const list = Array.isArray(toolCalls) ? toolCalls : [];
  if (!list.length) return list;
  const { computeEligibleHowTools } = require('./computeEligibleHowTools');
  const { eligible } = computeEligibleHowTools(state);
  const allow = new Set(eligible);
  return list.filter((c) => {
    const name = String(c?.name || c?.toolName || '').trim();
    return Boolean(name) && allow.has(name);
  });
}

/**
 * HOW: dedupe + eligible gate (LLM / stub). No rewrite_soft_dep.
 */
function filterHowToolCallsForSelect(state, toolCalls) {
  return filterHowToolCallsByEligible(
    state,
    filterAlreadySuccessfulHowToolCalls(state, toolCalls)
  );
}

/** @deprecated use filterHowToolCallsByEligible — kept for test aliases */
function filterHowToolCallsBySoftDeps(state, toolCalls) {
  return filterHowToolCallsByEligible(state, toolCalls);
}

function howRequiredToolsStillMissing(state) {
  try {
    const { howReactCatalogTools } = require('./computeEligibleHowTools');
    const { successfulHowTools } = require('./howToolDag');
    const done = successfulHowTools(state);
    return howReactCatalogTools().filter((name) => !done.has(name));
  } catch {
    return [];
  }
}

async function decideToolCalls(state, opts = {}) {
  if (typeof opts.decideToolCalls === 'function') {
    return opts.decideToolCalls(state, opts);
  }

  const env = opts.env || state.env || process.env;
  const phase = opts.phase || 'what';
  const tools = describeToolsForPrompt(phase);
  const allowedToolNames = tools.map((t) => t.toolName);

  if (!isLlmEnabled(env) || String(env.LLM_PROVIDER || '').toLowerCase() === 'mock') {
    return stubDecideToolCalls(state, tools, phase);
  }

  const prompt = buildAgentPrompt(state, phase, tools);
  const gen = await generateJson({
    prompt,
    temperature: 0.1,
    numPredict: 512,
    timeoutMs: Number(env.G17_LLM_TIMEOUT_MS) || 120000,
    env,
  });

  const data = gen.ok && gen.data && typeof gen.data === 'object' ? gen.data : {};
  const rawCalls = Array.isArray(data.toolCalls)
    ? data.toolCalls
    : Array.isArray(data.tool_calls)
      ? data.tool_calls
      : [];
  const parsed = parseToolCalls(rawCalls, { allowedToolNames });
  let decision = {
    tool_calls: parsed.accepted.map((c) => ({
      id: `call_${c.toolName}_${Date.now()}`,
      name: c.toolName,
      args: c.arguments || {},
    })),
    rejected: parsed.rejected,
    done: Boolean(data.done) && parsed.accepted.length === 0,
    stub: false,
  };

  // WHAT: never re-execute a tool that already succeeded (LLM often re-picks BG).
  if (phase === 'what' && decision.tool_calls.length) {
    const before = decision.tool_calls.length;
    decision.tool_calls = filterAlreadySuccessfulWhatToolCalls(state, decision.tool_calls);
    const dropped = before - decision.tool_calls.length;
    if (dropped > 0) {
      console.info(
        '[agent_core] what.selectTools drop_already_done dropped=%s remain=%s',
        dropped,
        decision.tool_calls.length
      );
    }
  }

  // HOW: dedupe + soft dependency gate (ReAct must not skip Wbs→Dependency etc.).
  if (phase === 'how' && decision.tool_calls.length) {
    const before = decision.tool_calls.length;
    decision.tool_calls = filterHowToolCallsForSelect(state, decision.tool_calls);
    const dropped = before - decision.tool_calls.length;
    if (dropped > 0) {
      console.info(
        '[agent_core] how.selectTools drop_done_or_deps dropped=%s remain=%s',
        dropped,
        decision.tool_calls.length
      );
    }
  }

  // Hard gate: LLM often returns done=true with empty calls → prepare→finalizeMeta skip.
  // WHAT must run full catalog before done (completeness SoT).
  if (phase === 'what' && (!decision.tool_calls.length || decision.done)) {
    const missing = whatRequiredToolsStillMissing(state);
    if (missing.length) {
      const forced = stubDecideToolCalls(
        {
          ...state,
          gapReport: {
            ...(state.gapReport || {}),
            missing,
            hint: `Missing required WHAT tools: ${missing.join(', ')}`,
          },
        },
        tools,
        phase
      );
      console.info(
        '[agent_core] what.selectTools override_llm_done missing=%s next=%s',
        missing.length,
        forced.tool_calls?.[0]?.name || '(none)'
      );
      decision = { ...forced, rejected: parsed.rejected, llmDoneIgnored: true };
    }
  }

  return decision;
}

/**
 * Offline stub: one unused registered tool per turn, prefer gap keywords; no phase catalog.
 * HOW: only pick tools whose soft deps are satisfied.
 */
function stubDecideToolCalls(state, tools, phase) {
  const done = new Set(
    (Array.isArray(state.toolResults) ? state.toolResults : [])
      .filter((r) => r && !r.error)
      .map((r) => r.toolName)
  );
  const howReady =
    phase === 'how'
      ? (() => {
          const { howToolDepsSatisfied } = require('./howToolDag');
          return (name) => howToolDepsSatisfied(name, done);
        })()
      : () => true;
  const missing = state.gapReport?.missing || [];
  const prefer = [];
  // Exact tool names from completeness gap (WHAT: full catalog).
  for (const area of missing) {
    const name = String(area || '').trim();
    if (
      name &&
      tools.some((t) => t.toolName === name) &&
      !done.has(name) &&
      howReady(name)
    ) {
      prefer.push(name);
    }
  }
  for (const area of missing) {
    const key = String(area).toLowerCase();
    for (const t of tools) {
      if (done.has(t.toolName) || prefer.includes(t.toolName) || !howReady(t.toolName)) {
        continue;
      }
      const blob = `${t.toolName} ${t.description}`.toLowerCase();
      if (
        (key.includes('functional') && blob.includes('fr')) ||
        (key.includes('usecase') && blob.includes('uc')) ||
        (key.includes('wbs') && blob.includes('wbs')) ||
        (key.includes('task') && blob.includes('wbs')) ||
        blob.includes(key.slice(0, 6))
      ) {
        prefer.push(t.toolName);
      }
    }
  }

  let nextName = prefer.find((n) => !done.has(n) && howReady(n));
  if (!nextName && phase === 'how') {
    // Canonical phase order — do not wander into optional secs before Schedule.
    try {
      const { CANONICAL_ORDER } = require('./howToolDag');
      nextName = CANONICAL_ORDER.find(
        (n) => tools.some((t) => t.toolName === n) && !done.has(n) && howReady(n)
      );
    } catch {
      nextName = null;
    }
  }
  if (!nextName) {
    const hints =
      phase === 'how'
        ? ['WbsTool', 'DependencyTool', 'ScheduleTool', 'RiskTool', 'QualityPlanTool']
        : ['WhatFrTool', 'WhatUCTool', 'WhatBGTool'];
    nextName = hints.find(
      (n) => tools.some((t) => t.toolName === n) && !done.has(n) && howReady(n)
    );
  }
  if (!nextName) {
    const remaining = tools
      .map((t) => t.toolName)
      .filter((n) => !done.has(n) && howReady(n));
    nextName = remaining[0] || null;
  }

  if (!nextName) {
    return { tool_calls: [], done: true, stub: true };
  }
  return {
    tool_calls: [{ id: `stub_${nextName}`, name: nextName, args: {} }],
    done: false,
    stub: true,
  };
}

function createSelectToolsNode(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const phase = hooks.phase || 'what';
  const decide = hooks.decideToolCalls || null;

  return async function selectToolsNode(state) {
    const budget = state.budget || resolveAgentBudget();
    const preStop = evaluateStopCondition({
      budget,
      startedAt: state.startedAt,
      iteration: Number(state.agentIteration) || 0,
      toolCallCount: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
    });
    if (preStop.stop) {
      return {
        stopReason: preStop.reason,
        history: [`stop:${preStop.reason}`],
        agentIteration: (Number(state.agentIteration) || 0) + 1,
      };
    }

    // RULE-P02: node-only — do not invent business substeps outside FR catalog.
    await onProgress?.({
      node: 'selectTools',
      phase,
      toolExecutions: Array.isArray(state.toolExecutions) ? state.toolExecutions : [],
    });

    let decision = await decideToolCalls(state, {
      phase,
      decideToolCalls: decide,
      env: state.env || process.env,
    });

    /** @type {string|null} */
    let hardStopReason = null;
    /** @type {object|null} */
    let stuckIncompleteError = null;
    const {
      STOP_TOOL_FAILED,
      hasPhaseHardToolStop,
      findStuckIncompleteTool,
    } = require('./howPhaseToolNodes');

    // Hard gate (incl. custom decideToolCalls): never re-Send tools already successful.
    if (phase === 'what') {
      if (hasPhaseHardToolStop(state)) {
        const hardFail = (Array.isArray(state?.toolResults) ? state.toolResults : []).find(
          (row) => row?.error
        );
        console.info(
          '[agent_core] what.selectTools stop_on_tool_error tool=%s code=%s',
          hardFail?.toolName || '(unknown)',
          hardFail?.error?.code || state.stopReason || '-'
        );
        decision = { tool_calls: [], done: true, stub: false };
        hardStopReason = STOP_TOOL_FAILED;
      } else {
        const rawCalls = Array.isArray(decision.tool_calls) ? decision.tool_calls : [];
        const filtered = filterAlreadySuccessfulWhatToolCalls(state, rawCalls);
        if (filtered.length < rawCalls.length) {
          console.info(
            '[agent_core] what.selectTools drop_already_done dropped=%s remain=%s',
            rawCalls.length - filtered.length,
            filtered.length
          );
        }
        if (!filtered.length) {
          const missing = whatRequiredToolsStillMissing(state);
          if (missing.length) {
            const tools = describeToolsForPrompt(phase);
            decision = stubDecideToolCalls(
              {
                ...state,
                gapReport: {
                  ...(state.gapReport || {}),
                  missing,
                  hint: `Missing required WHAT tools: ${missing.join(', ')}`,
                },
              },
              tools,
              phase
            );
          } else {
            decision = { ...decision, tool_calls: [], done: true };
          }
        } else {
          decision = { ...decision, tool_calls: filtered, done: false };
        }
      }
    }

    // HOW: eligible-only (no rewrite); hard fail / stuck / deadlock → stop.
    if (phase === 'how') {
      const {
        computeEligibleHowTools,
        isHowReadyForFinalize,
        detectHowSelectDeadlock,
      } = require('./computeEligibleHowTools');
      if (hasPhaseHardToolStop(state)) {
        const hardFail = (Array.isArray(state?.toolResults) ? state.toolResults : []).find(
          (row) => row?.error
        );
        console.info(
          '[agent_core] how.selectTools stop_on_tool_error tool=%s code=%s',
          hardFail?.toolName || '(unknown)',
          hardFail?.error?.code || state.stopReason || '-'
        );
        decision = { tool_calls: [], done: true, stub: false };
        hardStopReason = STOP_TOOL_FAILED;
      } else if (isHowReadyForFinalize(state)) {
        decision = { tool_calls: [], done: true, stub: false, readyForFinalize: true };
      } else {
        const stuck = findStuckIncompleteTool(state, 2);
        if (stuck) {
          console.info(
            '[agent_core] how.selectTools stop_incomplete_stuck tool=%s attempts=%s',
            stuck.toolName,
            stuck.attempts
          );
          decision = { tool_calls: [], done: true, stub: false };
          hardStopReason = STOP_TOOL_FAILED;
          stuckIncompleteError = {
            toolName: stuck.toolName,
            error: {
              code: 'TOOL_STUCK_INCOMPLETE',
              message: `${stuck.toolName} thất bại sau ${stuck.attempts} lần (incomplete: ${stuck.reason}). Dừng phase — không chạy tiếp.`,
            },
          };
        } else {
          const { eligible } = computeEligibleHowTools(state);
          const rawCalls = Array.isArray(decision.tool_calls) ? decision.tool_calls : [];
          let filtered = filterHowToolCallsForSelect(state, rawCalls);
          if (filtered.length < rawCalls.length) {
            console.info(
              '[agent_core] how.selectTools drop_ineligible dropped=%s remain=%s eligible=%s',
              rawCalls.length - filtered.length,
              filtered.length,
              eligible.length
            );
          }
          if (!filtered.length) {
            if (eligible.length) {
              const next = eligible[0];
              console.info(
                '[agent_core] how.selectTools pick_eligible tool=%s eligible=%s',
                next,
                eligible.length
              );
              decision = {
                tool_calls: [{ id: `elig_${next}`, name: next, args: {} }],
                done: false,
                stub: true,
              };
            } else {
              const deadlock = detectHowSelectDeadlock(state);
              if (deadlock.deadlocked) {
                console.info(
                  '[agent_core] how.selectTools deadlock reason=%s blocked=%s',
                  deadlock.reason,
                  (deadlock.blocked || [])
                    .map((b) => `${b.toolName}:${(b.blockedBy || []).join('|')}`)
                    .join(',')
                );
                decision = { tool_calls: [], done: true, stub: false };
                hardStopReason = deadlock.reason;
              } else {
                decision = { tool_calls: [], done: true };
              }
            }
          } else {
            decision = { ...decision, tool_calls: filtered, done: false };
          }
        }
      }
    }

    const tool_calls = Array.isArray(decision.tool_calls) ? decision.tool_calls : [];
    const content = decision.done ? 'done' : `calling ${tool_calls.length} tool(s)`;
    let aiMessage;
    try {
      const { listPlainToolNames, normalizeAssistantAiMessage } = require('./phasePlainToolNode');
      const plainSet = new Set(listPlainToolNames(phase));
      const hasPlain = tool_calls.some((c) => plainSet.has(c.name || c.toolName));
      if (hasPlain) {
        aiMessage = normalizeAssistantAiMessage(
          { role: 'assistant', content, tool_calls },
          {}
        );
      }
    } catch (_) {
      /* adapter optional at boot */
    }
    if (!aiMessage) {
      aiMessage = { role: 'assistant', content, tool_calls };
    }

    const update = {
      messages: [aiMessage],
      history: hardStopReason ? [`selectTools:stop:${hardStopReason}`] : ['selectTools'],
      agentIteration: (Number(state.agentIteration) || 0) + 1,
    };
    if (hardStopReason) update.stopReason = hardStopReason;
    if (stuckIncompleteError) update.toolResults = [stuckIncompleteError];
    return update;
  };
}

async function executeHowToolCall(state, toolName, args, hooks = {}) {
  const onProgress = hooks.onProgress || null;
  if (isHowSecPhaseOnly(toolName)) assertPhaseGraphOnly(toolName, 'how');
  await onProgress?.({ node: 'call_tool', phase: 'how', tool: toolName, tools: [toolName] });
  const layerBase =
    state.container && typeof state.container === 'object' ? state.container : {};
  const stepStarted = Date.now();
  try {
    const toolContext = buildToolContext({
      pack: state.pack || {},
      toolData: state.toolData || {},
      container: layerBase,
      runId: state.runId || null,
      generationId: state.generationId || state.runId || null,
      contextPackage: state.contextPackage || null,
      toolName,
    });
    toolContext.container = layerBase;
    const input = {
      ...buildToolInput({
        container: layerBase,
        pack: state.pack || {},
        toolData: state.toolData || {},
        snapshotId: state.snapshotId || null,
        contextPackage: state.contextPackage || null,
        toolName,
      }),
      ...(args && typeof args === 'object' ? args : {}),
    };
    const {
      createToolExecution,
      executionToLegacyToolResult,
      attemptCountForTool,
      hashToolInput,
      ERROR_CODES,
    } = require('./toolExecutionContract');
    const attempt = attemptCountForTool(state, toolName) + 1;
    const inputHash = hashToolInput(toolName, {
      snapshotId: state.snapshotId,
      taskCount: Array.isArray(layerBase?.planning?.tasks)
        ? layerBase.planning.tasks.length
        : 0,
    });
    const toolOut = await invokeTool(toolName, input, toolContext);
    if (
      toolOut?.result?.waitingExternal ||
      toolOut?.waitingExternal ||
      toolOut?.result?.meta?.waitingExternal ||
      toolOut?.meta?.waitingExternal
    ) {
      const meta = toolOut?.result?.meta || toolOut?.meta || {};
      const execution = createToolExecution({
        toolName,
        status: 'waiting_external',
        attempt,
        inputHash,
        outputValidated: false,
        jobId: meta.jobId || meta.threadId || null,
        deadlineAt: meta.deadlineAt || null,
        progress: meta.progress || null,
        startedAt: new Date(stepStarted).toISOString(),
        reason: 'wbs_chunk_fan_in',
      });
      return {
        toolExecutions: [execution],
        toolResults: [executionToLegacyToolResult(execution)],
        history: [`waiting_external:${toolName}`],
        messages: [
          {
            role: 'tool',
            name: toolName,
            content: JSON.stringify({
              ok: false,
              status: 'waiting_external',
              jobId: execution.jobId,
            }),
          },
        ],
      };
    }
    if (toolOut == null) {
      const execution = createToolExecution({
        toolName,
        status: 'failed',
        attempt,
        inputHash,
        outputValidated: false,
        error: {
          code: ERROR_CODES.TOOL_RESULT_MISSING,
          retryable: true,
          message: `Tool "${toolName}" returned undefined`,
        },
        startedAt: new Date(stepStarted).toISOString(),
      });
      const { STOP_TOOL_FAILED } = require('./howPhaseToolNodes');
      return {
        toolExecutions: [execution],
        toolResults: [executionToLegacyToolResult(execution)],
        stopReason: STOP_TOOL_FAILED,
        history: [`error:${toolName}:missing`],
        messages: [
          {
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ ok: false, code: ERROR_CODES.TOOL_RESULT_MISSING }),
          },
        ],
      };
    }
    try {
      assertToolOutputHasEvidence(toolName, toolOut);
    } catch (evErr) {
      const execution = createToolExecution({
        toolName,
        status: 'failed',
        attempt,
        inputHash,
        outputValidated: false,
        error: {
          code: evErr?.code || ERROR_CODES.TOOL_OUTPUT_INVALID,
          retryable: false,
          message: String(evErr?.message || evErr).slice(0, 240),
        },
        startedAt: new Date(stepStarted).toISOString(),
      });
      const { STOP_TOOL_FAILED } = require('./howPhaseToolNodes');
      return {
        toolExecutions: [execution],
        toolResults: [executionToLegacyToolResult(execution)],
        stopReason: STOP_TOOL_FAILED,
        history: [`error:${toolName}:invalid`],
        messages: [
          {
            role: 'tool',
            name: toolName,
            content: JSON.stringify({
              ok: false,
              code: execution.error.code,
              error: execution.error.message,
            }),
          },
        ],
      };
    }
    const durationMs = Math.max(0, Date.now() - stepStarted);
    const rawPatch =
      toolOut?.result?.container && typeof toolOut.result.container === 'object'
        ? toolOut.result.container
        : null;
    const containerPatch = sparseContainerPatch(layerBase, rawPatch);
    const execution = createToolExecution({
      toolName,
      status: 'succeeded',
      attempt,
      inputHash,
      outputValidated: true,
      outputRef: `${toolName}:${inputHash}`,
      startedAt: new Date(stepStarted).toISOString(),
    });
    return {
      toolExecutions: [execution],
      toolResults: [{ ...executionToLegacyToolResult(execution), durationMs }],
      history: [`execute:${toolName}`],
      container: containerPatch || undefined,
      messages: [
        {
          role: 'tool',
          tool_call_id: `how_${toolName}`,
          name: toolName,
          content: JSON.stringify({ ok: true, durationMs, status: 'succeeded' }),
        },
      ],
    };
  } catch (err) {
    const durationMs = Math.max(0, Date.now() - stepStarted);
    const code = err?.code || 'TOOL_FAILED';
    const message = String(err?.message || err).slice(0, 240);
    console.warn(
      '[agent_core] how.execute tool=%s code=%s msg=%s',
      toolName,
      code,
      message
    );
    const {
      createToolExecution,
      executionToLegacyToolResult,
      attemptCountForTool,
      hashToolInput,
    } = require('./toolExecutionContract');
    const { STOP_TOOL_FAILED } = require('./howPhaseToolNodes');
    const execution = createToolExecution({
      toolName,
      status: 'failed',
      attempt: attemptCountForTool(state, toolName) + 1,
      inputHash: hashToolInput(toolName, { snapshotId: state.snapshotId }),
      outputValidated: false,
      error: { code, retryable: Boolean(err?.retryable), message },
      startedAt: new Date(stepStarted).toISOString(),
    });
    return {
      toolExecutions: [execution],
      toolResults: [{ ...executionToLegacyToolResult(execution), durationMs }],
      stopReason: STOP_TOOL_FAILED,
      history: [`error:${toolName}`],
      messages: [
        {
          role: 'tool',
          name: toolName,
          content: JSON.stringify({ ok: false, error: message, code }),
        },
      ],
    };
  }
}

async function executeWhatToolCall(state, toolName, args, hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const {
    applyFrToolToState,
    applySectionToolToState,
    ensureProposal,
  } = require('./whatPhaseToolNodes');
  const { WHAT_FR_TOOL, WHAT_SECTION_TOOLS } = require('../whatSecs/sectionCatalog');
  const { prepareSectionDerive, assertCriticalDeriveOk } = require('../semantic/runRawSectionDerive');
  const { shouldRawDeriveSection } = require('../semantic/rawSectionDerivePolicy');

  if (toolName === WHAT_FR_TOOL || isWhatSectionPhaseOnly(toolName)) {
    assertPhaseGraphOnly(toolName, 'what');
  }

  const engineId =
    toolName === WHAT_FR_TOOL
      ? 'fr'
      : (WHAT_SECTION_TOOLS.find((s) => s.toolName === toolName) || {}).engineId || null;

  await onProgress?.({
    node: 'call_tool',
    phase: 'what',
    tool: toolName,
    tools: [toolName],
    engineId: engineId || undefined,
  });

  const stepStarted = Date.now();
  try {
    const proposal = ensureProposal(state);
    const env = state.env || process.env;

    if (engineId && engineId !== 'fr') {
      const prepared = prepareSectionDerive({
        engineId,
        pack: state.pack || {},
        env,
        proposal,
        snapshot: state.snapshot || null,
        frUnderstanding: state.frUnderstanding || null,
        evidence: state.frUnderstanding?.evidence || null,
        contextPackage: state.contextPackage || null,
        locale: state.frOpts?.locale || state.pack?.aiAnalysis?.deriveLocale || null,
      });
      if (prepared.mode === 'result') {
        const applied = applySectionToolToState(state, engineId, prepared.result);
        const durationMs = Math.max(0, Date.now() - stepStarted);
        const containerBase =
          state.container && typeof state.container === 'object' ? state.container : {};
        let containerPatch = null;
        if (applied.srsProposal) {
          containerPatch = sparseContainerPatch(containerBase, {
            analyses: {
              ...(containerBase.analyses || {}),
              srsProposal: applied.srsProposal,
            },
          });
        }
        return {
          ...applied,
          toolResults: [{ toolName, durationMs, engineId, skippedLlm: true }],
          history: [`execute:${toolName}:prepared`],
          container: containerPatch || undefined,
          messages: [
            {
              role: 'tool',
              name: toolName,
              content: JSON.stringify({ ok: true, prepared: true }),
            },
          ],
        };
      }
    }

    const toolContext = {
      contextName: 'understanding',
      pack: state.pack || {},
      proposal,
      snapshot: state.snapshot || null,
      frUnderstanding: state.frUnderstanding || null,
      contextPackage: state.contextPackage || null,
      snapshotId: state.snapshotId || null,
      runId: state.runId || null,
      frOpts: state.frOpts || {},
      env,
      locale: state.frOpts?.locale || null,
    };

    const input =
      toolName === WHAT_FR_TOOL
        ? {
            snapshot: state.snapshot,
            pack: state.pack || {},
            snapshotId: state.snapshotId,
            runId: state.runId,
            frOpts: {
              ...(state.frOpts || {}),
              pauseAtDataGate: false,
              priorCorpusHash: state.corpusContentHash || null,
              snapshotId: state.snapshotId,
              priorPartial:
                state.frOpts?.priorPartial ||
                state.understandingPartial ||
                null,
            },
            ...(args && typeof args === 'object' ? args : {}),
          }
        : {
            ...toolContext,
            evidence: state.frUnderstanding?.evidence || null,
            ...(args && typeof args === 'object' ? args : {}),
          };

    const toolOut = await invokeTool(toolName, input, toolContext);
    assertToolOutputHasEvidence(toolName, toolOut);
    const durationMs = Math.max(0, Date.now() - stepStarted);
    const result = toolOut.result || {};

    if (engineId && engineId !== 'fr' && shouldRawDeriveSection(engineId, state.pack || {}, env)) {
      assertCriticalDeriveOk(engineId, result, env);
    }

    let applied;
    if (toolName === WHAT_FR_TOOL) {
      applied = applyFrToolToState(state, result);
    } else if (engineId) {
      applied = applySectionToolToState(state, engineId, result);
    } else {
      applied = {};
    }

    const containerBase =
      state.container && typeof state.container === 'object' ? state.container : {};
    let containerPatch = null;
    if (applied.srsProposal) {
      containerPatch = sparseContainerPatch(containerBase, {
        analyses: {
          ...(containerBase.analyses || {}),
          srsProposal: applied.srsProposal,
        },
      });
    }

    return {
      ...applied,
      toolResults: [{ toolName, durationMs, engineId: engineId || undefined }],
      history: [`execute:${toolName}`],
      container: containerPatch || undefined,
      messages: [
        {
          role: 'tool',
          name: toolName,
          content: JSON.stringify({ ok: true, durationMs }),
        },
      ],
    };
  } catch (err) {
    const durationMs = Math.max(0, Date.now() - stepStarted);
    const { STOP_TOOL_FAILED } = require('./howPhaseToolNodes');
    return {
      toolResults: [
        {
          toolName,
          durationMs,
          error: {
            code: err?.code || 'TOOL_FAILED',
            message: String(err?.message || err).slice(0, 240),
          },
        },
      ],
      stopReason: STOP_TOOL_FAILED,
      history: [`error:${toolName}`],
      messages: [
        {
          role: 'tool',
          name: toolName,
          content: JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 240) }),
        },
      ],
    };
  }
}

module.exports = {
  appendMessages,
  appendList,
  stateForToolSend,
  describeToolsForPrompt,
  routeAfterSelectTools,
  decideToolCalls,
  stubDecideToolCalls,
  filterAlreadySuccessfulWhatToolCalls,
  filterAlreadySuccessfulHowToolCalls,
  filterHowToolCallsBySoftDeps,
  filterHowToolCallsForSelect,
  whatRequiredToolsStillMissing,
  createSelectToolsNode,
  executeHowToolCall,
  executeWhatToolCall,
  lastAiMessage,
  sparseContainerPatch,
};
