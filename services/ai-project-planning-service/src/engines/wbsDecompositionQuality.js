/**
 * WBS decomposition quality — contract coverage + responsibility/scope gates.
 * Source signals read FR/AC text only (what the requirement requires).
 * Task layer uses declared `area` (LLM schema), not keyword classification of task titles.
 */

const UI_AREAS = new Set(['frontend', 'design']);
const SERVER_AREAS = new Set(['backend', 'infra', 'infrastructure', 'api']);

/** Requirement-side signals: FR/AC claims that need non-UI implementation. */
const SOURCE_SERVER_SIGNALS = Object.freeze([
  /l[uư]u\s+d[uữ]\s*li[eệ]u/i,
  /l[uư]u\s+tr[uữ]/i,
  /tr[uước]\s*khi\s+l[uư]u/i,
  /\bpersist\b/i,
  /\bdatabase\b/i,
  /\bapi\b/i,
  /\bendpoint\b/i,
  /\bbackend\b/i,
  /duy\s*nh[aấ]t/i,
  /\bunique(ness)?\b/i,
  /ki[eể]m\s*tra\s*m[aã]/i,
  /\bvalidation\b/i,
  /x[aá]c\s*th[uự]c/i,
]);

const STOP_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'task',
  'create',
  'build',
  'implement',
  'add',
  'make',
  'form',
  'user',
  'system',
  'when',
  'after',
  'before',
  'using',
  'và',
  'của',
  'cho',
  'với',
  'khi',
  'trên',
  'sau',
  'trước',
  'được',
  'một',
  'các',
  'này',
  'đó',
  'tạo',
  'thêm',
  'làm',
]);

/** Multi-word behaviors that must appear in FR/AC if present on a task. */
const SCOPE_PHRASES = Object.freeze([
  { id: 'map_display', re: /b[aả]n\s*đ[oồ]|\bmap\b|\bgis\b|geolocat/i },
  { id: 'notification', re: /th[oô]ng\s*b[aá]o|\bnotification\b|push\s*notif/i },
  { id: 'export_report', re: /xu[aấ]t\s*b[aá]o\s*c[aá]o|export\s*report/i },
]);

function normalizeRef(raw) {
  return String(raw || '').trim();
}

function normalizeText(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceCorpus(frUnit) {
  const parts = [
    frUnit?.name,
    frUnit?.description,
    frUnit?.statement,
    ...(Array.isArray(frUnit?.ac) ? frUnit.ac : []),
    ...(Array.isArray(frUnit?.businessRules) ? frUnit.businessRules : []),
  ];
  return normalizeText(parts.filter(Boolean).join(' '));
}

function tokenize(text) {
  return normalizeText(text)
    .split(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t));
}

function acCitationCovers(whitelistAc, citedList, resolveFn) {
  const cited = Array.isArray(citedList) ? citedList : [];
  if (cited.some((c) => normalizeRef(c) === normalizeRef(whitelistAc))) return true;
  if (typeof resolveFn === 'function') {
    return cited.some((c) => {
      const resolved = resolveFn(c);
      return resolved != null && normalizeRef(resolved) === normalizeRef(whitelistAc);
    });
  }
  return false;
}

function sourceNeedsServerWork(frUnit) {
  const corpus = sourceCorpus(frUnit);
  if (!corpus) return false;
  return SOURCE_SERVER_SIGNALS.some((re) => re.test(corpus));
}

/**
 * Title alone is not enough to decompose safely.
 * @returns {{ ok: boolean, clarifications: object[] }}
 */
function assessInputReadiness(frUnits = []) {
  const clarifications = [];
  for (const unit of Array.isArray(frUnits) ? frUnits : []) {
    if (!unit?.id) continue;
    const ac = Array.isArray(unit.ac) ? unit.ac.filter((a) => String(a || '').trim()) : [];
    const desc = String(unit.description || unit.statement || '').trim();
    const title = String(unit.name || '').trim();
    if (ac.length === 0 && desc.length < 24) {
      clarifications.push({
        frId: unit.id,
        code: 'insufficient_source',
        question:
          'Thiếu AC hoặc mô tả đủ chi tiết để phân rã thành task độc lập. Cần bổ sung AC/hành vi/đầu ra trước khi WBS.',
        missing: ['acceptanceCriteria', 'description'],
        title: title || unit.id,
      });
    }
  }
  return { ok: clarifications.length === 0, clarifications };
}

/**
 * @param {{
 *   frUnits: object[],
 *   tasks: object[],
 *   clarifications?: object[],
 *   resolveAcRef?: Function,
 * }} opts
 * @returns {{ ok: boolean, issues: object[], clarifications: object[] }}
 */
function assessDecompositionQuality(opts = {}) {
  const frUnits = Array.isArray(opts.frUnits) ? opts.frUnits : [];
  const tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
  const clarifications = Array.isArray(opts.clarifications) ? [...opts.clarifications] : [];
  const issues = [];
  const resolveAcRef = opts.resolveAcRef;

  const byFr = new Map();
  for (const leaf of tasks) {
    const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
    if (!frId) {
      issues.push({
        code: 'missing_source_fr',
        taskId: leaf?.id || null,
        message: 'Task thiếu sourceFrIds.',
      });
      continue;
    }
    if (!byFr.has(frId)) byFr.set(frId, []);
    byFr.get(frId).push(leaf);
  }

  for (const unit of frUnits) {
    const frId = normalizeRef(unit?.id);
    if (!frId) continue;
    const leaves = byFr.get(frId) || [];
    const acList = (Array.isArray(unit.ac) ? unit.ac : []).map(normalizeRef).filter(Boolean);
    const corpus = sourceCorpus(unit);
    const frTitle = normalizeText(unit.name || '');

    if (!leaves.length) {
      issues.push({
        code: 'uncovered_fr',
        frId,
        message: `FR ${frId} chưa có task.`,
      });
      continue;
    }

    // AC coverage — each AC must be implemented by ≥1 task cite.
    for (const ac of acList) {
      const cited = [];
      for (const leaf of leaves) {
        for (const ref of leaf.acRefs || []) cited.push(ref);
      }
      const covered = acCitationCovers(ac, cited, (raw) =>
        resolveAcRef ? resolveAcRef(raw, acList, frId) : null
      );
      if (!covered) {
        issues.push({
          code: 'uncovered_ac',
          frId,
          ac,
          message: `AC chưa được task nào thực hiện: ${ac}`,
        });
      }
    }

    // Deliverable independence + no whole-story paraphrase as sole leaf.
    for (const leaf of leaves) {
      const name = normalizeText(leaf.name || '');
      const deliverable = String(leaf.deliverable || '').trim();
      if (!deliverable || deliverable.length < 8) {
        issues.push({
          code: 'missing_deliverable',
          frId,
          taskId: leaf.id,
          message: 'Task thiếu đầu ra hoàn thành (deliverable) riêng.',
        });
      }
      if (leaves.length === 1 && frTitle && name === frTitle) {
        issues.push({
          code: 'story_paraphrase',
          frId,
          taskId: leaf.id,
          message: 'Một task không được diễn đạt lại toàn bộ tiêu đề Story/FR.',
        });
      }
    }

    // Responsibility: source requires server/data work but only UI areas own the leaves.
    if (sourceNeedsServerWork(unit)) {
      const hasServerLeaf = leaves.some((leaf) =>
        SERVER_AREAS.has(String(leaf.area || '').toLowerCase())
      );
      const onlyUi = leaves.every((leaf) => UI_AREAS.has(String(leaf.area || '').toLowerCase()));
      if (!hasServerLeaf || onlyUi) {
        issues.push({
          code: 'missing_server_work',
          frId,
          message:
            'Nguồn yêu cầu lưu/kiểm tra hợp lệ hoặc tính duy nhất phía server, nhưng chỉ có task giao diện. Thêm task backend (hoặc dẫn chiếu phần đã có) — kiểm tra trên UI không thay thế.',
        });
      }
    }

    // Scope: behaviors on the task must be grounded in FR/AC/businessRules.
    for (const leaf of leaves) {
      const leafText = `${leaf.name || ''} ${leaf.deliverable || ''}`;
      for (const phrase of SCOPE_PHRASES) {
        if (phrase.re.test(leafText) && !phrase.re.test(corpus)) {
          issues.push({
            code: 'ungrounded_scope',
            frId,
            taskId: leaf.id,
            tokens: [phrase.id],
            message: `Task có hành vi "${phrase.id}" không có căn cứ trong FR/AC nguồn.`,
          });
        }
      }
      const tokens = tokenize(leafText);
      const ungrounded = tokens.filter((t) => !corpus.includes(t));
      if (ungrounded.length >= 3) {
        issues.push({
          code: 'ungrounded_scope',
          frId,
          taskId: leaf.id,
          tokens: ungrounded.slice(0, 8),
          message: `Task có khái niệm chưa có trong nguồn: ${ungrounded.slice(0, 5).join(', ')}`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    clarifications,
  };
}

function formatRepairFeedback(quality) {
  const issues = Array.isArray(quality?.issues) ? quality.issues : [];
  const clarifications = Array.isArray(quality?.clarifications) ? quality.clarifications : [];
  return {
    instruction:
      'Previous decomposition failed quality checks. Fix only the listed gaps. Do not invent scope. If information is insufficient, return clarifications and omit invented tasks.',
    issues,
    clarifications,
  };
}

module.exports = {
  assessInputReadiness,
  assessDecompositionQuality,
  formatRepairFeedback,
  sourceNeedsServerWork,
  sourceCorpus,
  UI_AREAS,
  SERVER_AREAS,
};
