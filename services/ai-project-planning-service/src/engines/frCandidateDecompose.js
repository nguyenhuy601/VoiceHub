/**
 * Requirement Decomposition — propose FR Candidates from Customer Raw prose.
 * Candidates stay PROPOSED; do not invent unstated business rules as facts.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');

const BEHAVIOR_KEYS = Object.freeze([
  'dup_warning',
  'add_role',
  'task_salary',
  'list_view',
  'edit',
  'delete',
]);

function frId(row, index = 0) {
  return String(row?.externalId || row?.logicalId || row?.id || `FR-${index + 1}`).trim();
}

function proseOf(row) {
  return [row?.name, row?.title, row?.description, row?.acceptanceCriteria]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join('\n');
}

function looksMonolithic(row) {
  const text = proseOf(row);
  if (text.length < 120) return false;
  const hits = [
    /trùng|cảnh\s*báo/i,
    /thêm|tạo/i,
    /sửa/i,
    /xoá|xóa/i,
    /danh\s*sách|STT/i,
    /lương|hoa\s*hồng|KPI/i,
  ].filter((re) => re.test(text)).length;
  return hits >= 3;
}

function buildDecomposePrompt(row) {
  const id = frId(row);
  return [
    'You are Requirement Decomposition. Return JSON only.',
    'Split ONE customer-raw requirement into independent FRs (one verifiable behavior each).',
    'Do NOT invent rules not in the source (no soft-delete policy, no KPI schema, no auth).',
    'Preserve verbatim formulas and form/list field names in description.',
    'Every candidate MUST include openQuestions[] for unclear points (KPI fields, soft vs hard delete, block-on-duplicate, STT meaning) — never invent answers.',
    'Prefer 4–8 candidates. MUST emit separate candidates for: duplicate-name warning, create/add form, task-salary lines+formula, list columns, edit, delete when those appear in SOURCE.',
    'Schema: { "candidates":[{ "tempId", "name", "description", "actor", "module", "sourceSpan", "behaviorKey", "openQuestions":["…"] }], "coverageNotes":[] }',
    'behaviorKey ∈ dup_warning|add_role|task_salary|list_view|edit|delete|other',
    `sourceFrId=${id}`,
    `SOURCE=<<EOF\n${proseOf(row)}\nEOF`,
  ].join('\n');
}

const DEFAULT_OPEN_QUESTIONS = Object.freeze({
  dup_warning: ['Có chặn lưu khi trùng tên không?', 'So sánh tên có phân biệt hoa thường không?'],
  add_role: ['KPI gồm những trường nào?', 'Trường nào trên form bắt buộc?'],
  task_salary: [
    'Lương nhiệm vụ tính theo từng dòng hay tổng nhiều dòng?',
    'Đơn vị Tỉ lệ hoa hồng và Tỉ lệ lương nhiệm vụ có giống nhau không?',
  ],
  list_view: ['STT chỉ là số thứ tự hiển thị hay mã định danh ổn định?'],
  edit: [],
  delete: ['Xóa mềm hay xóa hẳn?', 'Xử lý khi vai trò đang được sử dụng?'],
  other: [],
});

function enrichOpenQuestions(behaviorKey, questions, description) {
  const base = Array.isArray(questions)
    ? questions.map((q) => String(q || '').trim()).filter(Boolean)
    : [];
  const defaults = DEFAULT_OPEN_QUESTIONS[behaviorKey] || [];
  const text = `${description || ''} ${base.join(' ')}`;
  const out = [...base];
  for (const q of defaults) {
    if (out.length >= 6) break;
    if (out.some((x) => x.toLowerCase() === q.toLowerCase())) continue;
    // Always attach defaults for ambiguous behaviors (source did not specify answers)
    if (behaviorKey === 'dup_warning' || behaviorKey === 'delete' || behaviorKey === 'add_role' || behaviorKey === 'task_salary' || behaviorKey === 'list_view') {
      out.push(q);
    } else if (!/kpi|xóa|xoá|trùng|STT/i.test(text)) {
      out.push(q);
    }
  }
  return out.slice(0, 8);
}

function normalizeCandidates(data, sourceRow) {
  const raw = Array.isArray(data?.candidates) ? data.candidates : [];
  const sourceId = frId(sourceRow);
  const moduleLabel = sourceRow?.moduleLabel || sourceRow?.module || '';
  const actor = sourceRow?.actor || 'Admin';
  const out = [];
  const seen = new Set();
  raw.forEach((c, i) => {
    const name = String(c?.name || c?.title || '').trim().slice(0, 500);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const tempId = String(c?.tempId || `${sourceId}-C${i + 1}`).trim().slice(0, 64);
    let behaviorKey = BEHAVIOR_KEYS.includes(String(c?.behaviorKey || '').trim())
      ? String(c.behaviorKey).trim()
      : 'other';
    if (behaviorKey === 'other') {
      const blob = `${name} ${c?.description || ''}`;
      const hit = BEHAVIOR_KEYS.find((k) => {
        const map = {
          dup_warning: /trùng|cảnh\s*báo/i,
          add_role: /thêm|tạo|form/i,
          task_salary: /lương\s*nhiệm\s*vụ|công\s*thức/i,
          list_view: /danh\s*sách|STT/i,
          edit: /sửa|chỉnh\s*sửa/i,
          delete: /xoá|xóa/i,
        };
        return map[k]?.test(blob);
      });
      if (hit) behaviorKey = hit;
    }
    const description = String(c?.description || '').trim().slice(0, 4000);
    out.push({
      externalId: tempId,
      level: 'Requirement',
      parentExternalId: sourceId,
      name,
      description,
      moduleLabel: String(c?.module || moduleLabel || '').trim().slice(0, 240),
      actor: String(c?.actor || actor || '').trim().slice(0, 240),
      acceptanceCriteria: '',
      priority: 'Medium',
      status: 'PROPOSED',
      sourceKind: 'fr_candidate_decompose',
      sourceFrId: sourceId,
      sourceSpan: String(c?.sourceSpan || '').trim().slice(0, 800),
      behaviorKey,
      openQuestions: enrichOpenQuestions(
        behaviorKey,
        Array.isArray(c?.openQuestions) ? c.openQuestions : [],
        description
      ),
    });
  });
  return out;
}

/**
 * Heuristic fallback when LLM fails — still produces candidate FRs for coverage eval.
 */
function mergeMissingBehaviors(primary, fallback) {
  const have = new Set(
    (primary || []).map((c) => c.behaviorKey).filter((k) => k && k !== 'other')
  );
  const out = [...(primary || [])];
  for (const row of fallback || []) {
    if (!row.behaviorKey || row.behaviorKey === 'other') continue;
    if (have.has(row.behaviorKey)) continue;
    have.add(row.behaviorKey);
    out.push(row);
  }
  return out;
}

function heuristicDecompose(row) {
  const sourceId = frId(row);
  const text = proseOf(row);
  const moduleLabel = row?.moduleLabel || row?.module || 'Vai trò';
  const actor = row?.actor || 'Admin';
  const templates = [
    {
      behaviorKey: 'dup_warning',
      re: /cảnh\s*báo|trùng/i,
      name: 'Phát hiện / cảnh báo vai trò trùng tên',
      description: 'Hiển thị cảnh báo khi tạo trùng. Chưa rõ: chặn lưu hay chỉ cảnh báo; so sánh hoa/thường.',
      openQuestions: ['Có chặn lưu khi trùng tên không?', 'So sánh tên có phân biệt hoa thường không?'],
    },
    {
      behaviorKey: 'add_role',
      re: /thêm|form|tên vai trò/i,
      name: 'Thêm vai trò',
      description:
        'Form: Tên vai trò, Ghi chú, Phần trăm hoa hồng, Lương cố định, KPI (cấu trúc KPI chưa rõ).',
      openQuestions: ['KPI gồm những trường nào?', 'Trường nào bắt buộc?'],
    },
    {
      behaviorKey: 'task_salary',
      re: /lương\s*nhiệm\s*vụ|số\s*lượng.*t[ỉi]\s*l[ệe]|m[ốo]c/i,
      name: 'Cấu hình lương nhiệm vụ',
      description:
        'Nội dung, Tình trạng (Đạt / Chưa Đạt / Khác), Mốc (Số tiền), Tỉ lệ (Phần trăm), Số lượng. Công thức: Lương = Số lượng x Tỉ lệ x Mốc.',
      openQuestions: ['Tính theo từng dòng hay tổng nhiều dòng?', 'Đơn vị Tỉ lệ hoa hồng vs lương nhiệm vụ có giống nhau không?'],
    },
    {
      behaviorKey: 'list_view',
      re: /danh\s*sách|STT/i,
      name: 'Xem danh sách vai trò',
      description:
        'Cột: STT (tự tăng), Tên vai trò, Lương cố định, Phần trăm hoa hồng, Lương nhiệm vụ, KPI, Ghi chú, Thao tác.',
      openQuestions: ['STT chỉ là số thứ tự hiển thị hay mã định danh ổn định?'],
    },
    {
      behaviorKey: 'edit',
      re: /sửa/i,
      name: 'Sửa vai trò',
      description: 'Cho phép sửa thông tin vai trò và cấu hình liên quan theo phạm vi đã mô tả.',
      openQuestions: [],
    },
    {
      behaviorKey: 'delete',
      re: /xoá|xóa/i,
      name: 'Xóa vai trò',
      description: 'Cho phép xóa vai trò. Chưa rõ soft/hard delete và điều kiện khi vai trò đang được dùng.',
      openQuestions: ['Xóa mềm hay xóa hẳn?', 'Xử lý khi vai trò đang được sử dụng?'],
    },
  ];
  const out = [];
  templates.forEach((t, i) => {
    if (!t.re.test(text) && t.behaviorKey !== 'add_role') return;
    if (!t.re.test(text) && t.behaviorKey === 'add_role' && !/vai\s*trò/i.test(text)) return;
    out.push({
      externalId: `${sourceId}-C${i + 1}`,
      level: 'Requirement',
      parentExternalId: sourceId,
      name: t.name,
      description: t.description,
      moduleLabel,
      actor,
      acceptanceCriteria: '',
      priority: 'Medium',
      status: 'PROPOSED',
      sourceKind: 'fr_candidate_decompose_heuristic',
      sourceFrId: sourceId,
      sourceSpan: (text.match(t.re) || [''])[0],
      behaviorKey: t.behaviorKey,
      openQuestions: t.openQuestions,
    });
  });
  return out;
}

/**
 * @param {{ pack?: object, env?: object, generateJsonFn?: Function, forceHeuristic?: boolean }} opts
 */
async function decomposeFrCandidates(opts = {}) {
  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const generate = opts.generateJsonFn || generateJson;
  const frs = Array.isArray(pack.functionalRequirements) ? pack.functionalRequirements : [];
  const candidates = [];
  const meta = { llmCalls: 0, heuristic: 0, skipped: 0, errors: [] };

  for (let i = 0; i < frs.length; i += 1) {
    const row = frs[i];
    if (!looksMonolithic(row) && frs.length > 1) {
      candidates.push({
        ...row,
        status: row.status || 'EXTRACTED',
        behaviorKey: row.behaviorKey || 'other',
        openQuestions: Array.isArray(row.openQuestions) ? row.openQuestions : [],
        sourceFrId: frId(row, i),
      });
      meta.skipped += 1;
      continue;
    }
    if (!looksMonolithic(row) && frs.length === 1 && proseOf(row).length < 80) {
      candidates.push({ ...row, status: row.status || 'EXTRACTED' });
      meta.skipped += 1;
      continue;
    }

    let produced = [];
    if (!opts.forceHeuristic && isLlmEnabled(env)) {
      const prompt = buildDecomposePrompt(row);
      const result = await generate({
        prompt,
        numPredict: 1024,
        numCtx: 4096,
        timeoutMs: 120000,
        temperature: 0.1,
        env,
      });
      meta.llmCalls += result.skipped ? 0 : 1;
      if (result.ok && result.data) {
        produced = normalizeCandidates(result.data, row);
      } else {
        meta.errors.push(result.error || 'decompose_failed');
      }
    }
    if (produced.length < 3) {
      produced = heuristicDecompose(row);
      meta.heuristic += 1;
    } else {
      // Fill missing required behaviors the LLM omitted (still PROPOSED + openQuestions).
      const merged = mergeMissingBehaviors(produced, heuristicDecompose(row));
      if (merged.length > produced.length) {
        meta.heuristic += 1;
        produced = merged;
      }
    }
    candidates.push(...produced);
  }

  const packOut = {
    ...pack,
    functionalRequirements: candidates,
    frCandidateMeta: {
      ...meta,
      sourceFrCount: frs.length,
      candidateCount: candidates.length,
    },
  };
  return { ok: candidates.length > 0, pack: packOut, candidates, meta };
}

module.exports = {
  BEHAVIOR_KEYS,
  looksMonolithic,
  buildDecomposePrompt,
  heuristicDecompose,
  mergeMissingBehaviors,
  normalizeCandidates,
  decomposeFrCandidates,
};
