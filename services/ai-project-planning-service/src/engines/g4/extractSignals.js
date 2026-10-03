/**
 * G4.2 — Extract deterministic FR signals (no LLM).
 * Field values win; regex only fills empty actor/action slots.
 */

const ACTOR_RE =
  /\b(admin|user|staff|teacher|student|lecturer|actor)\b/gi;
const ACTION_RE =
  /\b(create|update|delete|view|login|select|enter|tạo|tao|sửa|sua|xóa|xoa|xem|đăng nhập|dang nhap|nhập|nhap|chọn|chon)\b/gi;
const FIELD_RE =
  /\b(code|name|status|email|password|mã|ma|tên|ten|trạng thái|trang thai)\b/gi;

function uniq(arr) {
  return [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))];
}

function matchAll(re, text) {
  const out = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = r.exec(text))) out.push(m[1] || m[0]);
  return out;
}

/**
 * @param {object} fr normalized FR
 */
function extractFrSignals(fr = {}) {
  const fieldActors = uniq(
    Array.isArray(fr.actorsRaw) ? fr.actorsRaw : fr.actorsRaw ? [fr.actorsRaw] : []
  );
  const fieldModule = fr.module ? String(fr.module).trim() : '';
  const fieldAc = String(fr.ac || '').trim();
  const fieldPriority = fr.priority != null ? String(fr.priority).trim() : '';

  const prose = [fr.title, fr.description, fr.ac].filter(Boolean).join(' ');

  // Regex only when actor field is empty.
  const actors = fieldActors.length
    ? fieldActors
    : uniq(matchAll(ACTOR_RE, prose));

  const actions = uniq(matchAll(ACTION_RE, prose)).map((a) => a.toLowerCase());
  const fields = uniq(matchAll(FIELD_RE, prose));
  const crud = [];
  if (actions.some((a) => /create|tạo|tao/.test(a))) crud.push('create');
  if (actions.some((a) => /update|sửa|sua/.test(a))) crud.push('update');
  if (actions.some((a) => /delete|xóa|xoa/.test(a))) crud.push('delete');
  if (actions.some((a) => /view|xem|select|chọn|chon/.test(a))) crud.push('read');

  const objects = [];
  // Prefer nouns already present as structured signals; light regex only as supplement.
  if (/\b(course|class|account|user)\b/i.test(prose)) {
    if (/\bcourse\b/i.test(prose)) objects.push('Course');
    if (/\bclass\b/i.test(prose)) objects.push('Class');
    if (/\b(user|account)\b/i.test(prose)) objects.push('User');
  }

  const hasAcceptanceCriteria = Boolean(fieldAc);
  const textLength = prose.length;
  const flags = [];
  if (!actors.length) flags.push('missing_actor');
  if (!hasAcceptanceCriteria) flags.push('missing_ac');
  if (textLength < 40) flags.push('thin_text');
  if (/TBD|TODO|chưa rõ|chua ro|\?\?\?/i.test(prose)) flags.push('ambiguous');
  if (fieldModule && fr.feature && /cross|liên phân hệ|lien phan he/i.test(prose)) {
    flags.push('cross_module');
  }

  return {
    frId: fr.id,
    module: fieldModule || null,
    feature: fr.feature || null,
    actors,
    actions,
    objects: uniq(objects),
    fields,
    crud: uniq(crud),
    hasAcceptanceCriteria,
    priority: fieldPriority || null,
    acceptanceCriteria: fieldAc || null,
    name: fr.title || null,
    description: fr.description || null,
    textLength,
    flags,
    // Keep a short prose view for keyword tools; structured fields are primary.
    text: prose.slice(0, 600),
  };
}

function extractAllSignals(normalizedFrs = []) {
  return normalizedFrs.map((fr) => extractFrSignals(fr));
}

module.exports = {
  extractFrSignals,
  extractAllSignals,
};
