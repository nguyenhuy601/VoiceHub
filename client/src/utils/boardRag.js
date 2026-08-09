/** Ngưỡng việc mở (chưa trễ) → đèn vàng. Luật RAG 3 dòng, ghi luận văn. */
export const BOARD_RAG_OPEN_WARN = 8;

/**
 * Đèn sức khỏe board từ số đã có (không bịa %).
 * đỏ: overdue > 0; vàng: open >= N; xanh: còn lại.
 */
export function boardRag(board, { openWarn = BOARD_RAG_OPEN_WARN } = {}) {
  const overdue = Number(board?.overdue) || 0;
  const open = Number(board?.open) || 0;
  const warn = Number.isFinite(Number(openWarn)) ? Number(openWarn) : BOARD_RAG_OPEN_WARN;
  if (overdue > 0) return { rag: 'red', reason: 'overdue' };
  if (open >= warn) return { rag: 'amber', reason: 'open_load' };
  return { rag: 'green', reason: 'ok' };
}
