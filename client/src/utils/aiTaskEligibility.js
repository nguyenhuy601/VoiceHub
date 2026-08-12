/**
 * Điều kiện tin nhắn có thể đưa vào pipeline AI tạo task (khớp backend/worker).
 */

function hasExplicitDateTime(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return false;
  const dateRe =
    /\b\d{1,2}[/\-.]\d{1,2}(?:\/\d{2,4})?\b|ngày\s+\d{1,2}(?:[/\-.]\d{1,2})?|hôm nay|ngày mai|ngày mốt|tuần sau|cuối tuần|thứ\s*(2|3|4|5|6|7|bảy)|chủ nhật|deadline|hạn|today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;
  const timeRe =
    /\b([01]?\d|2[0-3])[:h][0-5]\d\b|\b([01]?\d|2[0-3])h\b|\b(1[0-2]|0?[1-9])\s?(am|pm)\b|\bsáng\b|\bchiều\b|\btối\b|\btrưa\b/i;
  // Đủ ngày+giờ, hoặc có mốc ngày/hạn tương đối (thứ Sáu, tuần sau…) để mở pipeline AI.
  return (dateRe.test(raw) && timeRe.test(raw)) || dateRe.test(raw);
}

/**
 * @param {object|null} message
 * @param {{ organizationId?: string|null, channelKind?: string|null }} ctx
 * @param {(path: string) => string} t — translator từ useAppStrings
 * @returns {{ ok: boolean, reason: string, code: string }}
 */
export function getAiTaskEligibility(message, ctx = {}, t) {
  const tr = typeof t === 'function' ? t : (k) => k;
  const { organizationId, channelKind } = ctx;

  // Chuẩn Vàng team1 D5: DM 1-1 không bật AI extract task mặc định.
  const kind = String(channelKind || '').toLowerCase();
  if (kind === 'dm' || kind === 'friend' || kind === 'direct') {
    return { ok: false, reason: tr('aiTask.dmDisabled'), code: 'dmDisabled' };
  }

  if (!message) {
    return { ok: false, reason: tr('aiTask.noMessage'), code: 'noMessage' };
  }
  const mid = message._id || message.id;
  if (!mid) {
    return { ok: false, reason: tr('aiTask.invalidMessage'), code: 'invalidMessage' };
  }
  if (message.isDeleted || message.isRecalled) {
    return { ok: false, reason: tr('aiTask.deletedOrRecalled'), code: 'deletedOrRecalled' };
  }

  const mt = message.messageType || 'text';
  if (mt === 'system') {
    return { ok: false, reason: tr('aiTask.systemMessage'), code: 'systemMessage' };
  }

  if (!organizationId) {
    return { ok: false, reason: tr('aiTask.needOrg'), code: 'needOrg' };
  }

  if (mt === 'text') {
    const text = String(message.content ?? '').trim();
    if (!text) {
      return { ok: false, reason: tr('aiTask.emptyText'), code: 'emptyText' };
    }
    if (!hasExplicitDateTime(text)) {
      return { ok: false, reason: tr('aiTask.needDateTime'), code: 'needDateTime' };
    }
  }

  if (mt === 'image' || mt === 'file') {
    const hasFile = Boolean(message.fileMeta?.storagePath);
    const caption = String(message.content ?? '').trim();
    const hasCaption = caption.length > 0;
    if (!hasFile && !hasCaption) {
      return { ok: false, reason: tr('aiTask.needFileOrCaption'), code: 'needFileOrCaption' };
    }
    if (!hasExplicitDateTime(caption)) {
      return { ok: false, reason: tr('aiTask.fileNeedDateTime'), code: 'fileNeedDateTime' };
    }
  }

  return { ok: true, reason: '', code: '' };
}

/** Các mã chỉ cảnh báo — vẫn cho mở modal AI để người chỉnh tay. */
export const AI_TASK_SOFT_BLOCK_CODES = new Set(['needDateTime', 'fileNeedDateTime']);

export function getAiTaskTooltipShort(t) {
  return typeof t === 'function' ? t('aiTask.tooltipShort') : 'aiTask.tooltipShort';
}

/** @deprecated dùng getAiTaskTooltipShort(t) */
export const AI_TASK_TOOLTIP_SHORT = '';
