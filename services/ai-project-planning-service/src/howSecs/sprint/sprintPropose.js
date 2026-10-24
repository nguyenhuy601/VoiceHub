/**
 * Sprint propose — goal and PBI ids only. Numbers stay on FACTS.
 */

const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { LLM_SHAPE } = require('./sprintSchema');

const SYSTEM_RULES = [
  'Bạn là Sprint Planning Engine cho dự án phần mềm theo Scrum. Đề xuất phân bổ Product Backlog Items (PBI) vào Sprint dựa trên giá trị, Sprint Goal, dependency và capacity. Không tự quyết định thay Product Owner hoặc Developers.',
  'Rules',
  '1. Tạo Sprint Goal cụ thể, có giá trị và có thể kiểm chứng cho mỗi Sprint.',
  '2. Ưu tiên PBI theo thứ tự ưu tiên đầu vào; xét thêm giá trị, rủi ro, dependency và mức độ sẵn sàng.',
  '3. Chỉ chọn PBI khi có đủ dữ liệu lập kế hoạch và các prerequisite bắt buộc đã hoàn thành hoặc có thể đáp ứng trong Sprint theo dependency hợp lệ.',
  '4. Tổng effort dự kiến phải phù hợp capacity khả dụng của đội trong Sprint. Capacity phải tính đến ngày làm việc, ngày nghỉ, thời gian không dành cho dự án và phân bổ đa dự án nếu có.',
  '5. Không chia đều số lượng PBI giữa các Sprint; không áp đặt số Story hoặc Story Point cố định.',
  '6. Không tự ý chia một PBI thành nhiều phần để lấp đầy Sprint. Nếu PBI quá lớn hoặc không thể hoàn thành trong Sprint, đề xuất phân rã thành các PBI nhỏ hơn, có giá trị độc lập; chờ xác nhận trước khi sử dụng các PBI mới.',
  '7. WBS task là công việc triển khai PBI, không mặc định là PBI độc lập. Không chọn task nếu PBI cha chưa được chọn.',
  '8. Chỉ coi PBI là hoàn thành khi đáp ứng Definition of Done. Estimate là dự báo, không phải bảo đảm hoàn thành.',
  '9. Không bịa effort, dependency, priority, capacity hoặc trạng thái hoàn thành. Thiếu dữ liệu thì ghi rõ vấn đề và không tự suy diễn.',
  '10. Khi không thể đáp ứng đồng thời mục tiêu, dependency và capacity, nêu xung đột, đề xuất phương án và lý do. Không âm thầm bỏ qua ràng buộc.',
  '11. Trả về JSON đúng schema; không có Markdown hoặc nội dung ngoài JSON.',
  '12. Chỉ dùng sprint id và pbi id trong ALLOW. Không tạo id mới. Không ghi số giờ, ngày, hay capacity. Không đề xuất kéo dài Sprint. Nếu việc không vừa timebox, ghi conflict và phương án giảm phạm vi hoặc đổi thứ tự.',
  'Sprint length trên FACTS là timebox cố định. projectDurationHours là đường găng cả dự án, không phải độ dài Sprint.',
  `Output ${JSON.stringify(LLM_SHAPE)}`,
].join(' ');

function llmFacts(facts) {
  return {
    timeboxNote: 'startDate/endDate are the Scrum timebox. Do not extend them.',
    projectDurationHours: facts.projectDurationHours ?? null,
    projectCriticalPath: facts.criticalPath || [],
    cpmPresent: Boolean(facts.cpmPresent),
    sprints: (facts.sprints || []).map((sprint) => ({
      id: sprint.id,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      sprintLengthDays: sprint.sprintLengthDays,
      taskIds: sprint.taskIds,
      effortHours: sprint.effortHours,
      feasibility: sprint.feasibility,
    })),
    pbis: (facts.pbis || []).map((pbi) => ({
      id: pbi.id,
      title: pbi.title,
      priority: pbi.priority,
      assignable: pbi.assignable,
      blockedReason: pbi.blockedReason,
      tasks: pbi.tasks,
    })),
    edges: facts.edges || [],
    capacity: facts.capacity
      ? {
          hardGate: facts.capacity.hardGate,
          totalSupplyHours: facts.capacity.totalSupplyHours,
          totalDemandHours: facts.capacity.totalDemandHours,
          totalGapHours: facts.capacity.totalGapHours,
          conflicts: (facts.capacity.conflicts || []).map((row) => ({
            type: row.type || null,
            taskId: row.taskId || null,
          })),
        }
      : null,
    openQuestions: facts.openQuestions || [],
  };
}

async function proposeSprint({ semantic, facts, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!facts?.ok) return { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const system = [SYSTEM_RULES, languageInstruction(semantic.business?.locale || 'vi')].join(' ');
  const user = [
    `SEMANTIC=${JSON.stringify(semantic)}`,
    `FACTS=${JSON.stringify(llmFacts(facts))}`,
    `ALLOW=${JSON.stringify(facts.allowLists || {})}`,
    `SHAPE=${JSON.stringify(LLM_SHAPE)}`,
  ].join('\n');
  const llm = await invokeHowSemanticLlm({ system, user, env, generateJsonFn });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

module.exports = { proposeSprint, SYSTEM_RULES };
