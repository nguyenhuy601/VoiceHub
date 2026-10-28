/**
 * LLM proposes Story→Sprint allocation + goal + rationale.
 * Does not invent capacity/effort; tool expands leaves and validates.
 */

const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { LLM_SHAPE } = require('./sprintSchema');
const { buildLlmSprintFacts } = require('./sprintFacts');

const SYSTEM_RULES = [
  'Bạn là trợ lý Sprint Planning. Đề xuất phân bổ Story (PBI) vào các Sprint có sẵn và viết Sprint Goal + rationale.',
  'Rules',
  '1. Chỉ dùng sprint id và pbi id trong ALLOW. Không tạo id mới.',
  '2. Không bịa, sửa hoặc ghi đè effortHours, capacity, dependency, hoặc ngày timebox.',
  '3. Không liệt kê task lá để thay tool — tool sẽ expand mọi leaf từ Story đã chọn.',
  '4. Tôn trọng dependency trong FACTS: predecessor không được xếp Sprint sau successor.',
  '5. Tổng effort Story (trên FACTS) phải phù hợp capacityHours từng Sprint khi FACTS có capacity.',
  '6. Ưu tiên PBI theo priority; không chia đều số Story một cách máy móc.',
  '7. Mỗi Sprint: goal cụ thể, có thể kiểm chứng; rationale giải thích lựa chọn ngắn.',
  '8. PBI không xếp được: ghi deferred với reasonCode/reason — không âm thầm bỏ.',
  '9. JSON đúng SHAPE; không Markdown ngoài JSON.',
  '10. Nếu VALIDATION_ERRORS có trong input: sửa đề xuất để hết lỗi; giữ các phần đã hợp lệ khi có thể.',
  `Output ${JSON.stringify(LLM_SHAPE)}`,
].join(' ');

/**
 * Slim semantic for prompt — never include full layer.requiredData.
 */
function slimSemanticForPrompt(semantic = {}) {
  return {
    business: semantic.business || {},
    system: semantic.system || {},
    upstream: {
      sprintIds: semantic.upstream?.sprintIds || [],
      pbiIds: semantic.upstream?.pbiIds || [],
    },
  };
}

async function proposeSprintAllocation({
  semantic,
  facts,
  env,
  generateJsonFn,
  repairContext = null,
  timeoutMs = null,
} = {}) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!facts?.ok) return { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };

  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const system = [SYSTEM_RULES, languageInstruction(semantic.business?.locale || 'vi')].join(' ');
  const userParts = [
    `SEMANTIC=${JSON.stringify(slimSemanticForPrompt(semantic))}`,
    `FACTS=${JSON.stringify(buildLlmSprintFacts(facts))}`,
    `ALLOW=${JSON.stringify(facts.allowLists || {})}`,
    `SHAPE=${JSON.stringify(LLM_SHAPE)}`,
  ];
  if (repairContext) {
    userParts.push(`REPAIR=${JSON.stringify(repairContext)}`);
  }
  const llm = await invokeHowSemanticLlm({
    system,
    user: userParts.join('\n'),
    env,
    generateJsonFn,
    ...(timeoutMs != null ? { timeoutMs } : {}),
  });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

/** @deprecated use proposeSprintAllocation */
async function proposeSprint(args) {
  return proposeSprintAllocation(args);
}

module.exports = {
  proposeSprintAllocation,
  proposeSprint,
  SYSTEM_RULES,
  slimSemanticForPrompt,
};
