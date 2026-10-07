/**
 * Thứ tự modal đang mở (module-level vì Modal render qua portal, không chung tree).
 * Chỉ modal trên cùng được xử lý Esc/Tab để modal lồng nhau không đóng sai lớp.
 */
const openModals = [];

export function pushModal(token) {
  if (!token || openModals.includes(token)) return;
  openModals.push(token);
}

export function popModal(token) {
  const index = openModals.indexOf(token);
  if (index !== -1) openModals.splice(index, 1);
}

export function isTopModal(token) {
  return openModals.length > 0 && openModals[openModals.length - 1] === token;
}
