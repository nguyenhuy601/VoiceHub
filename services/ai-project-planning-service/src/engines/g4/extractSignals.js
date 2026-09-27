/**
 * G4.2 — Extract deterministic FR signals (no LLM).
 */

const ACTOR_RE =
  /\b(giảng viên|giang vien|sinh viên|sinh vien|lecturer|student|admin|user|người dùng|nguoi dung|teacher|staff)\b/gi;
const ACTION_RE =
  /\b(tạo|tao|create|sửa|sua|update|xóa|xoa|delete|xem|view|đăng nhập|dang nhap|login|nhập|nhap|enter|chọn|chon|select)\b/gi;
const FIELD_RE =
  /\b(mã|ma|code|tên|ten|name|status|trạng thái|trang thai|credit|tín chỉ|tin chi|email|password)\b/gi;

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
  const text = [fr.title, fr.description, fr.ac].filter(Boolean).join(' ');
  const actors = uniq([
    ...matchAll(ACTOR_RE, text),
    ...(Array.isArray(fr.actorsRaw) ? fr.actorsRaw : fr.actorsRaw ? [fr.actorsRaw] : []),
  ]);
  const actions = uniq(matchAll(ACTION_RE, text)).map((a) => a.toLowerCase());
  const fields = uniq(matchAll(FIELD_RE, text));
  const crud = [];
  if (actions.some((a) => /create|tạo|tao/.test(a))) crud.push('create');
  if (actions.some((a) => /update|sửa|sua/.test(a))) crud.push('update');
  if (actions.some((a) => /delete|xóa|xoa/.test(a))) crud.push('delete');
  if (actions.some((a) => /view|xem|select|chọn|chon/.test(a))) crud.push('read');

  const objects = [];
  if (/\b(học phần|hoc phan|course)\b/i.test(text)) objects.push('Course');
  if (/\b(lớp|lop|class)\b/i.test(text)) objects.push('Class');
  if (/\b(user|người dùng|nguoi dung|account)\b/i.test(text)) objects.push('User');

  const hasAcceptanceCriteria = Boolean(String(fr.ac || '').trim());
  const textLength = text.length;
  const flags = [];
  if (!actors.length) flags.push('missing_actor');
  if (!hasAcceptanceCriteria) flags.push('missing_ac');
  if (textLength < 40) flags.push('thin_text');
  if (/TBD|TODO|chưa rõ|chua ro|\?\?\?/i.test(text)) flags.push('ambiguous');
  if (fr.module && fr.feature && /cross|liên phân hệ|lien phan he/i.test(text)) {
    flags.push('cross_module');
  }

  return {
    frId: fr.id,
    module: fr.module || null,
    feature: fr.feature || null,
    actors,
    actions,
    objects: uniq(objects),
    fields,
    crud: uniq(crud),
    hasAcceptanceCriteria,
    textLength,
    flags,
    text: text.slice(0, 600),
  };
}

function extractAllSignals(normalizedFrs = []) {
  return normalizedFrs.map((fr) => extractFrSignals(fr));
}

module.exports = {
  extractFrSignals,
  extractAllSignals,
};
