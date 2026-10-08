/** Khớp `MAX_MESSAGE_CONTENT` của chat-service. */
export const CHAT_MESSAGE_MAX_LENGTH = 20000;

/**
 * Chỉ số highlight kế tiếp trong menu @mention (vòng tròn).
 * Trả `current` khi phím không phải điều hướng; `-1` khi danh sách rỗng.
 */
export function resolveMentionNavIndex(current, key, count) {
  if (!count || count < 1) return -1;
  const idx = Number.isInteger(current) && current >= 0 && current < count ? current : -1;
  if (key === 'ArrowDown') return idx < 0 || idx >= count - 1 ? 0 : idx + 1;
  if (key === 'ArrowUp') return idx <= 0 ? count - 1 : idx - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return idx < 0 ? 0 : idx;
}
