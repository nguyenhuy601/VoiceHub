/**
 * Quality sec — Semantic→Fact→Propose→Accept; env only from SNAP (no hardcoded dev/staging).
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { sliceByOutputBudget, clampOutputTokens } = require('../../runtime/modelOutputBudget');
const { buildQualitySemantic } = require('./qualityContext');

/** Several executable cases per FR; slice the completion budget accordingly. */
const QUALITY_TOKENS_PER_FR = 2200;
/** Same wall as WbsTool: one qwen-max slice must finish before the tool race. */
const QUALITY_LLM_DEFAULT_TIMEOUT_MS = 240_000;
const QUALITY_TOOL_DEFAULT_TIMEOUT_MS = 300_000;
const QUALITY_SLICE_MARGIN_MS = 15_000;

function clampTimeoutMs(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(15_000, Math.min(600_000, Math.round(n)));
}

function resolveQualityLlmTimeoutMs(env = process.env) {
  return clampTimeoutMs(env.HOW_QUALITY_LLM_TIMEOUT_MS, QUALITY_LLM_DEFAULT_TIMEOUT_MS);
}

function resolveQualityToolTimeoutMs(env = process.env) {
  return clampTimeoutMs(env.HOW_QUALITY_TOOL_TIMEOUT_MS, QUALITY_TOOL_DEFAULT_TIMEOUT_MS);
}

function resolveQualitySliceConcurrency(env = process.env) {
  const n = Number(env.HOW_QUALITY_SLICE_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return 2;
}

function qualitySliceBudgetMs(env = process.env) {
  return resolveQualityLlmTimeoutMs(env) + QUALITY_SLICE_MARGIN_MS;
}

function canStartQualitySlice(startedAt, callTimeout, budget, now = Date.now()) {
  return now - startedAt + callTimeout <= budget;
}

async function mapPool(items, limit, fn) {
  const queue = [...items];
  const workers = Math.max(1, Math.min(queue.length || 1, limit));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await fn(item);
      }
    })
  );
}
const {
  applyQualityPlanToContainer,
  isQualityPlanStructurallyOk,
} = require('../../engines/qualityPlan');

function field() {
  return Annotation();
}
function clip(s, max = 160) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

const QUALITY_LEVELS = new Set(['unit', 'integration', 'e2e', 'uat', 'nfr']);
const SCENARIO_TYPES = new Set(['positive', 'negative', 'boundary', 'exception']);
const TEST_TYPES = new Set([
  'functional',
  'performance',
  'security',
  'usability',
  'reliability',
  'compatibility',
]);
const QUALITY_PRIORITIES = new Set(['high', 'medium', 'low']);
const SOURCE_TYPES = new Set(['FR', 'UC', 'NFR', 'BR', 'API']);
const TC_ID = /^TC-\d{3,}$/;
const PLACEHOLDER_VALUE = /<[^>\n]{1,80}>/;

/** Optional string list. Null means the field is present but invalid. */
function optionalStringList(value, maxItems = 6, maxChars = 180) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const text = clip(item, maxChars);
    if (!text) return null;
    out.push(text);
  }
  return out;
}

function acceptTestData(value) {
  if (value == null) return [];
  const pairs = [];
  if (Array.isArray(value)) {
    if (value.length > 8) return null;
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      pairs.push([item.field, item.value]);
    }
  } else if (typeof value === 'object') {
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      if (pairs.length >= 8) break;
      pairs.push([fieldName, fieldValue]);
    }
  } else {
    return null;
  }
  const out = [];
  for (const [rawField, rawValue] of pairs) {
    const fieldName = clip(rawField, 80);
    const fieldValue = clip(
      rawValue != null && typeof rawValue !== 'object' ? rawValue : '',
      180
    );
    if (!fieldName || !fieldValue) return null;
    out.push({ field: fieldName, value: fieldValue });
  }
  return out;
}

function acceptSteps(value) {
  if (!Array.isArray(value) || !value.length || value.length > 8) return null;
  const out = [];
  for (const step of value) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
    const action = clip(step.action, 240);
    const expectedResult = clip(step.expectedResult, 240);
    if (!action || !expectedResult) return null;
    out.push({ stepNo: out.length + 1, action, expectedResult });
  }
  return out;
}

function allocateTcId(preferred, usedIds) {
  const raw = String(preferred || '').trim().toUpperCase();
  if (TC_ID.test(raw) && !usedIds.has(raw)) {
    usedIds.add(raw);
    return raw;
  }
  let n = 1;
  let id = 'TC-001';
  while (usedIds.has(id)) {
    n += 1;
    id = `TC-${String(n).padStart(3, '0')}`;
  }
  usedIds.add(id);
  return id;
}

function useCasesForFrSlice(useCases, frSlice) {
  const all = Array.isArray(useCases) ? useCases : [];
  if (!frSlice) return all.slice(0, 8);
  const ids = new Set(frSlice.map((row) => row.id));
  const linked = all.filter((uc) => (uc.relatedFrIds || []).some((id) => ids.has(id)));
  return (linked.length ? linked : all).slice(0, 8);
}

async function proposeQuality({ semantic, facts, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const system = `Bạn là chuyên gia QA/Test Design. Chỉ trả về JSON hợp lệ.

Chuyển các nguồn trong SEMANTIC thành Test Case thực thi được. Một FR có thể cần nhiều Test Case. Không tóm tắt yêu cầu thành một tiêu đề.

QUY TẮC:
1. Chỉ dùng nguồn có trong SEMANTIC. Mọi sourceRefs.id phải nằm trong ALLOW và giữ nguyên ID.
2. Mỗi Test Case xác minh một mục tiêu độc lập và phải có ít nhất một sourceRefs hợp lệ (FR, UC, NFR, BR hoặc API). Không ép mọi case phải có UC.
3. Với FR/UC, chỉ sinh positive, negative, boundary hoặc exception khi nguồn có căn cứ (luồng chính, luồng thay thế, luồng ngoại lệ, AC, BR). Không ép đủ mọi loại cho mọi FR.
4. Với NFR, chỉ sinh kịch bản đo khi nguồn có ngưỡng hoặc cách quan sát. Thiếu tải thử, cửa sổ đo hoặc cách thu số liệu thì status = "needs_confirmation" và ghi missingInformation. Không bịa ngưỡng.
5. Mỗi case có preconditions, testData có căn cứ, steps[].action và steps[].expectedResult kiểm được. Không trả case chỉ có tiêu đề.
6. testLevel (unit|integration|e2e|uat|nfr) và testType (functional|performance|security|usability|reliability|compatibility) là hai trường riêng. scenarioType là positive|negative|boundary|exception. Chọn level theo đối tượng thực sự được kiểm, không gán unit cho mô tả nghiệp vụ thuần.
7. Không bịa quy tắc, thông báo lỗi, mã lỗi, hành vi DB/API, môi trường hay giá trị dữ liệu chưa có trong nguồn. Giá trị chưa đủ căn cứ: dùng mô tả căn cứ từ đặc tả, đặt status = "needs_confirmation", không dùng placeholder dạng <...>.
8. Không trùng mục tiêu và điều kiện. Một case có thể trỏ nhiều nguồn khi cùng một hành vi.
9. Không đưa chiến lược kiểm thử hay open question vào testCases. Không đủ căn cứ thì trả {"testCases":[]}.
10. priority thiếu căn cứ thì dùng medium. status của case là "proposed" hoặc "needs_confirmation", không phải kết quả chạy test.

SCHEMA:
{
  "testCases": [
    {
      "id": "TC-001",
      "title": "...",
      "objective": "...",
      "testLevel": "integration",
      "testType": "functional",
      "scenarioType": "positive",
      "priority": "medium",
      "preconditions": ["..."],
      "testData": [{"field": "...", "value": "..."}],
      "steps": [{"stepNo": 1, "action": "...", "expectedResult": "..."}],
      "sourceRefs": [{"type": "FR", "id": "FR-1"}],
      "status": "proposed",
      "missingInformation": ""
    }
  ]
}

Ngôn ngữ mô tả: tiếng Việt. Giữ nguyên tên riêng và ID nguồn.`;
  const frs = Array.isArray(semantic.business?.frs) ? semantic.business.frs : [];
  const frSlices = frs.length ? sliceByOutputBudget(frs, QUALITY_TOKENS_PER_FR, env) : [null];
  const testCases = [];
  let llmCalls = 0;
  let model = null;
  let lastFail = null;
  let slicesSkipped = 0;
  const callTimeout = resolveQualityLlmTimeoutMs(env);
  const budget = qualitySliceBudgetMs(env);
  const startedAt = Date.now();
  const slots = new Array(frSlices.length);
  await mapPool(
    frSlices.map((frSlice, index) => ({ frSlice, index })),
    resolveQualitySliceConcurrency(env),
    async ({ frSlice, index }) => {
      if (!canStartQualitySlice(startedAt, callTimeout, budget)) {
        slicesSkipped += 1;
        slots[index] = { ok: false, skipped: true, meta: { fallbackReason: 'slice_budget' } };
        return;
      }
      const sliceSemantic = {
        ...semantic,
        business: {
          ...semantic.business,
          frs: frSlice || semantic.business?.frs || [],
          useCases: useCasesForFrSlice(semantic.business?.useCases, frSlice),
        },
        layer: semantic.layer
          ? {
              ...semantic.layer,
              requiredData: {
                ...semantic.layer.requiredData,
                functionalRequirements: frSlice || semantic.layer.requiredData?.functionalRequirements || [],
              },
            }
          : undefined,
      };
      const frIds = frSlice ? frSlice.map((row) => row.id) : [];
      const allow = {
        ucKeys: facts.allowLists?.ucKeys || [],
        frIds: frIds.length ? frIds : facts.allowLists?.frIds || [],
        nfrIds: facts.allowLists?.nfrIds || [],
        brIds: facts.allowLists?.brIds || [],
        apiIds: facts.allowLists?.apiIds || [],
      };
      const user = [
        '<SEMANTIC>',
        JSON.stringify(sliceSemantic),
        '</SEMANTIC>',
        '',
        '<FACTS>',
        JSON.stringify({ allowLists: allow }),
        '</FACTS>',
        '',
        '<ALLOW>',
        JSON.stringify(allow),
        '</ALLOW>',
        '',
        'Sinh Test Case cho lát nguồn này. Mỗi mục tiêu kiểm thử là một case.',
        'Chỉ trả JSON đúng schema System.',
      ].join('\n');
      const llm = await invokeHowSemanticLlm({
        system,
        user,
        env,
        generateJsonFn,
        timeoutMs: callTimeout,
        numPredict: clampOutputTokens(80 + Math.max(1, frIds.length) * QUALITY_TOKENS_PER_FR, env),
      });
      slots[index] = llm;
    }
  );
  for (const llm of slots) {
    if (!llm || llm.skipped) {
      if (llm?.skipped) lastFail = llm.meta || { fallbackReason: 'slice_budget' };
      continue;
    }
    llmCalls += llm.meta?.llmCalls || 1;
    model = llm.meta?.model || model;
    if (llm.ok && Array.isArray(llm.data?.testCases)) testCases.push(...llm.data.testCases);
    else lastFail = llm.meta || { fallbackReason: 'llm_failed' };
  }
  if (!testCases.length && lastFail) {
    return { ok: false, data: null, meta: { ...lastFail, llmCalls, slicesSkipped } };
  }
  return { ok: true, data: { testCases }, meta: { llmCalls, model, slicesSkipped } };
}

function allowSets(facts) {
  return {
    FR: new Set(facts?.allowLists?.frIds || []),
    UC: new Set(facts?.allowLists?.ucKeys || []),
    NFR: new Set(facts?.allowLists?.nfrIds || []),
    BR: new Set(facts?.allowLists?.brIds || []),
    API: new Set(facts?.allowLists?.apiIds || []),
  };
}

function rejectSource(type) {
  if (type === 'FR') return 'fr_not_in_allow';
  if (type === 'UC') return 'uc_not_in_allow';
  return 'source_not_in_allow';
}

function pushRef(refs, sets, type, id) {
  const kind = String(type || '').trim().toUpperCase();
  const refId = String(id || '').trim();
  if (!SOURCE_TYPES.has(kind) || !refId) return { ok: false, reason: 'source_ref_invalid' };
  if (!sets[kind]?.has(refId)) return { ok: false, reason: rejectSource(kind), sourceUcKey: kind === 'UC' ? refId : undefined };
  if (!refs.some((ref) => ref.type === kind && ref.id === refId)) refs.push({ type: kind, id: refId });
  return { ok: true };
}

function acceptSourceRefs(row, sets) {
  const refs = [];
  const declaredUc = String(row?.sourceUcKey || '').trim();
  const hasUcIntent =
    Boolean(declaredUc) ||
    (Array.isArray(row?.sourceRefs) &&
      row.sourceRefs.some((r) => String(r?.type || '').toUpperCase() === 'UC'));

  if (Array.isArray(row?.sourceRefs) && row.sourceRefs.length) {
    for (const ref of row.sourceRefs) {
      const kind = String(ref?.type || '').toUpperCase();
      const pushed = pushRef(refs, sets, ref?.type, ref?.id);
      if (!pushed.ok) {
        return {
          ok: false,
          reason: kind === 'UC' ? 'MISSING_REQUIRED_UC_REF' : 'INVALID_SOURCE_REF',
          sourceUcKey: kind === 'UC' ? String(ref?.id || '') : undefined,
        };
      }
    }
  } else {
    if (declaredUc) {
      const pushed = pushRef(refs, sets, 'UC', declaredUc);
      if (!pushed.ok) {
        return { ok: false, reason: 'MISSING_REQUIRED_UC_REF', sourceUcKey: declaredUc };
      }
    }
    const frIds = Array.isArray(row?.sourceFrIds) ? row.sourceFrIds : [];
    const nfrIds = Array.isArray(row?.sourceNfrIds) ? row.sourceNfrIds : [];
    const brIds = Array.isArray(row?.sourceBrIds) ? row.sourceBrIds : [];
    const apiIds = Array.isArray(row?.sourceApiIds) ? row.sourceApiIds : [];
    for (const id of frIds) {
      const pushed = pushRef(refs, sets, 'FR', id);
      if (!pushed.ok) return { ok: false, reason: 'INVALID_SOURCE_REF', sourceFrIds: frIds };
    }
    for (const id of nfrIds) {
      const pushed = pushRef(refs, sets, 'NFR', id);
      if (!pushed.ok) return { ok: false, reason: 'INVALID_SOURCE_REF' };
    }
    for (const id of brIds) {
      const pushed = pushRef(refs, sets, 'BR', id);
      if (!pushed.ok) return { ok: false, reason: 'INVALID_SOURCE_REF' };
    }
    for (const id of apiIds) {
      const pushed = pushRef(refs, sets, 'API', id);
      if (!pushed.ok) return { ok: false, reason: 'INVALID_SOURCE_REF' };
    }
  }

  if (!refs.length) {
    return { ok: false, reason: 'INVALID_SOURCE_REF' };
  }
  if (hasUcIntent && !refs.some((r) => r.type === 'UC')) {
    return { ok: false, reason: 'MISSING_REQUIRED_UC_REF', sourceUcKey: declaredUc || undefined };
  }
  return { ok: true, refs };
}

function acceptTestCase(row, sets) {
  const title = clip(row?.title, 160);
  const objective = clip(row?.objective, 240);
  const testLevel = String(row?.testLevel || row?.level || '').trim().toLowerCase();
  const scenarioType = String(row?.scenarioType || row?.type || '').trim().toLowerCase();
  const explicitType = String(row?.testType || '').trim().toLowerCase();
  const testType = TEST_TYPES.has(explicitType) ? explicitType : testLevel === 'nfr' ? '' : 'functional';
  const priorityRaw = String(row?.priority || '').trim().toLowerCase();
  const priority = priorityRaw || 'medium';
  if (
    !title ||
    !objective ||
    !QUALITY_LEVELS.has(testLevel) ||
    !SCENARIO_TYPES.has(scenarioType) ||
    !QUALITY_PRIORITIES.has(priority)
  ) {
    return { ok: false, reason: 'testcase_fields_invalid' };
  }
  const linked = acceptSourceRefs(row, sets);
  if (!linked.ok) return linked;
  const preconditions = optionalStringList(row.preconditions) || [];
  const testData = acceptTestData(row.testData) || [];
  const steps = acceptSteps(row.steps) || [];
  const sourceUcKey = linked.refs.find((ref) => ref.type === 'UC')?.id || '';
  const sourceFrIds = linked.refs.filter((ref) => ref.type === 'FR').map((ref) => ref.id);
  const gaps = [];
  if (!preconditions.length) gaps.push('preconditions');
  if (!testData.length) gaps.push('test_data');
  if (!steps.length) gaps.push('steps');
  if (!testType) gaps.push('test_type');
  if (testLevel === 'nfr' && !testData.length) gaps.push('measurement');
  if (testData.some((item) => PLACEHOLDER_VALUE.test(item.value))) gaps.push('placeholder_data');
  const llmStatus = String(row?.status || '').trim().toLowerCase();
  if (llmStatus === 'needs_confirmation') gaps.push('needs_confirmation');
  const missingInformation = clip(row?.missingInformation || '', 240);
  if (missingInformation) gaps.push('missing_information');
  return {
    ok: true,
    testCase: {
      rawId: row?.id || row?.testCaseId,
      title,
      objective,
      testLevel,
      testType,
      scenarioType,
      priority,
      sourceUcKey,
      sourceFrIds,
      sourceRefs: linked.refs,
      preconditions,
      testData,
      steps,
      reviewStatus: gaps.length ? 'needs_confirmation' : 'proposed',
      missingInformation,
      confirmationGaps: gaps,
    },
  };
}

/**
 * Index blueprint WBS tasks for SoT stamps (no LLM invent).
 * Prefer story/task leaf over epic/feature when multiple match an FR.
 */
function buildWbsLookup(planningTasks = []) {
  const byFr = new Map();
  const byUc = new Map();
  const leafLevels = new Set(['story', 'task', 'subtask']);
  const rank = (level) => (leafLevels.has(String(level || '').toLowerCase()) ? 0 : 1);
  for (const t of Array.isArray(planningTasks) ? planningTasks : []) {
    if (!t || typeof t !== 'object') continue;
    const id = String(t.id || '').trim();
    if (!id) continue;
    const level = t.level;
    const frIds = Array.isArray(t.sourceFrIds) ? t.sourceFrIds : [];
    for (const fr of frIds) {
      const k = String(fr || '').trim();
      if (!k) continue;
      const prev = byFr.get(k);
      if (!prev || rank(level) < rank(prev.level)) byFr.set(k, { id, level });
    }
    const ucIds = Array.isArray(t.sourceUcIds) ? t.sourceUcIds : [];
    const ucKey = String(t.sourceUcKey || ucIds[0] || '').trim();
    if (ucKey) {
      const prev = byUc.get(ucKey);
      if (!prev || rank(level) < rank(prev.level)) byUc.set(ucKey, { id, level });
    }
  }
  return { byFr, byUc };
}

function buildFrToUcFromPack(useCases = []) {
  const map = new Map();
  for (const uc of Array.isArray(useCases) ? useCases : []) {
    if (!uc || typeof uc !== 'object') continue;
    const ucKey = String(uc.externalId || uc.externalKey || uc.id || '').trim();
    if (!ucKey) continue;
    const related = Array.isArray(uc.relatedFrIds)
      ? uc.relatedFrIds
      : String(uc.relatedFr || '')
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    for (const fr of related) {
      const frKey = String(fr || '').trim();
      if (frKey && !map.has(frKey)) map.set(frKey, ucKey);
    }
  }
  return map;
}

function resolveLinkedWbsTaskId({ sourceUcKey, sourceFrIds }, wbsLookup) {
  if (!wbsLookup) return null;
  for (const fr of Array.isArray(sourceFrIds) ? sourceFrIds : []) {
    const hit = wbsLookup.byFr.get(String(fr || '').trim());
    if (hit?.id) return hit.id;
  }
  const uc = String(sourceUcKey || '').trim();
  if (uc) {
    const hit = wbsLookup.byUc.get(uc);
    if (hit?.id) return hit.id;
  }
  return null;
}

function acceptQuality({ raw, facts, openQuestionsIn = [], container = null, pack = null } = {}) {
  const sets = allowSets(facts);
  const envAllow = [...(facts?.allowLists?.environments || [])];
  const rejectedInvent = [];
  const openQuestions = [...openQuestionsIn];
  for (const q of raw?.openQuestions || []) {
    if (q?.message) openQuestions.push({ code: q.code || 'QUAL_OQ', message: clip(q.message) });
  }

  const wbsLookup = buildWbsLookup(container?.planning?.tasks || []);
  const frToUc = buildFrToUcFromPack(pack?.useCases || []);

  const catalogExtra = [];
  const usedIds = new Set();
  const seenSignatures = new Set();
  const testCases = Array.isArray(raw?.testCases) ? raw.testCases : [];
  for (const row of testCases) {
    const accepted = acceptTestCase(row, sets);
    if (!accepted.ok) {
      rejectedInvent.push({ reason: accepted.reason, sourceUcKey: accepted.sourceUcKey });
      continue;
    }
    const testCase = accepted.testCase;
    let sourceUcKey = testCase.sourceUcKey || '';
    const sourceFrIds = Array.isArray(testCase.sourceFrIds) ? testCase.sourceFrIds : [];
    if (!sourceUcKey && sourceFrIds.length && frToUc.size) {
      for (const fr of sourceFrIds) {
        const derived = frToUc.get(String(fr || '').trim());
        if (derived) {
          sourceUcKey = derived;
          break;
        }
      }
    }
    const linkedWbsTaskId = resolveLinkedWbsTaskId(
      { sourceUcKey, sourceFrIds },
      wbsLookup
    );
    const refKey = testCase.sourceRefs.map((ref) => `${ref.type}:${ref.id}`).join(',');
    const signature = `${testCase.scenarioType}|${testCase.title.toLowerCase()}|${refKey}`;
    if (seenSignatures.has(signature)) {
      rejectedInvent.push({ reason: 'duplicate_testcase', title: testCase.title });
      continue;
    }
    seenSignatures.add(signature);
    const id = allocateTcId(testCase.rawId, usedIds);
    const executable = testCase.reviewStatus === 'proposed';
    catalogExtra.push({
      id,
      tcKey: id,
      recordKind: 'test_case',
      title: testCase.title,
      objective: testCase.objective,
      level: testCase.testLevel,
      type: testCase.scenarioType,
      testLevel: testCase.testLevel,
      testType: testCase.testType,
      scenarioType: testCase.scenarioType,
      priority: testCase.priority,
      sourceUcKey,
      sourceFrIds,
      sourceRefs: testCase.sourceRefs,
      preconditions: testCase.preconditions,
      testData: testCase.testData,
      steps: testCase.steps,
      reviewStatus: testCase.reviewStatus,
      executionStatus: 'not_run',
      completeness: executable ? 'executable' : 'incomplete',
      missingInformation: testCase.missingInformation,
      confirmationGaps: testCase.confirmationGaps,
      linkedWbsTaskId,
      automate: false,
      provenance: { type: 'AI', source: 'quality_sec_tool_llm' },
    });
  }

  const executableCount = catalogExtra.filter((e) => e.completeness === 'executable').length;
  const incompleteCount = catalogExtra.length - executableCount;

  const qualityPlan = {
    testStrategy: {
      levels: [],
      recordKind: 'test_strategy',
    },
    catalogPlan: catalogExtra.slice(0, 120),
    environments: envAllow.length ? envAllow : [],
    openQuestions,
    meta: {
      source: catalogExtra.length ? 'fact_llm' : 'empty',
      llmCatalogAdded: catalogExtra.length,
      executableCount,
      incompleteCount,
      rejectedInvent: rejectedInvent.map((r) => ({
        ...r,
        reasonCode: require('../../validation/qualityCoverageGate').mapQualityAcceptReason(
          r.reason
        ),
      })),
      inventEnvForbidden: true,
    },
  };

  const { stampQualityCoverageMeta } = require('../../validation/qualityCoverageGate');
  const stamped = stampQualityCoverageMeta(qualityPlan);
  stamped.meta = {
    ...(stamped.meta || {}),
    executableCount,
    incompleteCount,
  };

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    qualityPlan: stamped,
    meta: stamped.meta,
  };
}

const QualitySecState = Annotation.Root({
  pack: field(),
  container: field(),
  toolData: field(),
  snapshot: field(),
  contextPackage: field(),
  snapshotId: field(),
  env: field(),
  generateJsonFn: field(),
  semanticOut: field(),
  facts: field(),
  baseResult: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildQualitySecGraph() {
  const graph = new StateGraph(QualitySecState);
  graph.addNode('semantic', async (s) => ({
    semanticOut: await buildQualitySemantic({
      pack: s.pack,
      container: s.container,
      toolData: s.toolData,
      snapshot: s.snapshot,
      env: s.env,
      contextPackage: s.contextPackage,
      snapshotId: s.snapshotId,
    }),
  }));
  graph.addNode('fact', async (s) => {
    const sem = s.semanticOut || {};
    return {
      facts: { allowLists: sem.allowLists || {} },
    };
  });
  graph.addNode('propose', async (s) => {
    if (!s.semanticOut?.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    return {
      proposed: await proposeQuality({
        semantic: s.semanticOut.semantic,
        facts: s.facts,
        env: s.env,
        generateJsonFn: s.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (s) => {
    const sem = s.semanticOut || {};
    const proposed = s.proposed || {};
    const result = acceptQuality({
      raw: proposed.ok ? proposed.data : { catalogPlan: [] },
      facts: s.facts,
      container: s.container || null,
      pack: s.pack || null,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok ? [] : [{ code: 'QUAL_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(',') }]),
        ...(proposed.ok ? [] : [{ code: 'QUAL_LLM_SKIP', message: proposed.meta?.fallbackReason || 'llm' }]),
      ],
    });
    result.model = proposed.meta?.model || null;
    result.meta.llmCalls = proposed.meta?.llmCalls || 0;
    return {
      result,
      containerPatch: applyQualityPlanToContainer(s.container || {}, result),
    };
  });
  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let _c = null;
async function runQualitySecGraph(input = {}) {
  if (!_c) _c = buildQualitySecGraph();
  const out = await _c.invoke({
    pack: input.pack || {},
    container: input.container || {},
    toolData: input.toolData || {},
    snapshot: input.snapshot || null,
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshotId: input.snapshotId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = {
  buildQualitySecGraph,
  runQualitySecGraph,
  buildQualitySemantic,
  acceptQuality,
  buildWbsLookup,
  resolveLinkedWbsTaskId,
  isQualityPlanStructurallyOk,
  resolveQualityLlmTimeoutMs,
  resolveQualityToolTimeoutMs,
  resolveQualitySliceConcurrency,
  qualitySliceBudgetMs,
  canStartQualitySlice,
};
