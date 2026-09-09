/**
 * Tìm ancestor gần nhất có overflow cuộn (khung chứa danh sách tin).
 */
export function getScrollableAncestor(el) {
  if (!el) return null;
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** ChannelMessageToolbar compact (~36–40) + gap */
const EST_TOOLBAR_PX = 56;
/** Panel emoji quick-pick (max-h-48) + gap */
const EST_EMOJI_PANEL_PX = 200;
const GAP_PX = 8;

function spaceAboveInScroll(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const scrollEl = getScrollableAncestor(el);
  if (!scrollEl) return rect.top;
  const containerRect = scrollEl.getBoundingClientRect();
  return rect.top - containerRect.top;
}

function spaceBelowInScroll(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const scrollEl = getScrollableAncestor(el);
  if (!scrollEl) return window.innerHeight - rect.bottom;
  const containerRect = scrollEl.getBoundingClientRect();
  return containerRect.bottom - rect.bottom;
}

/**
 * true = đặt toolbar phía dưới bubble (không đủ chỗ phía trên trong khung cuộn).
 */
export function shouldPlaceToolbarBelowBubble(bubbleEl) {
  if (!bubbleEl) return false;
  return spaceAboveInScroll(bubbleEl) < EST_TOOLBAR_PX + GAP_PX;
}

/**
 * true = mở panel emoji phía dưới thanh toolbar (thiếu chỗ phía trên).
 */
export function shouldPlaceEmojiPanelBelow(anchorEl) {
  if (!anchorEl) return false;
  return spaceAboveInScroll(anchorEl) < EST_EMOJI_PANEL_PX + GAP_PX;
}

/**
 * Cuộn khung tin để chỗ trống phía trên/dưới đủ cho toolbar (+ emoji nếu cần).
 * List ngắn cũng tạo “room” bằng scroll khi đã có padding đầu list.
 */
export function ensureMessageToolbarRoom(bubbleEl, { needPx = EST_TOOLBAR_PX + GAP_PX, place = 'above' } = {}) {
  if (!bubbleEl || typeof window === 'undefined') return;
  const scrollEl = getScrollableAncestor(bubbleEl);
  if (!scrollEl) return;

  if (place === 'below') {
    const deficit = needPx - spaceBelowInScroll(bubbleEl);
    if (deficit > 0) {
      scrollEl.scrollTop += deficit + 4;
    }
    return;
  }

  const deficit = needPx - spaceAboveInScroll(bubbleEl);
  if (deficit > 0) {
    scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - deficit - 4);
  }
}

export { EST_TOOLBAR_PX, EST_EMOJI_PANEL_PX, GAP_PX };
