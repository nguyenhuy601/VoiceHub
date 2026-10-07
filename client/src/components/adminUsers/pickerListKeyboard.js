/**
 * ArrowUp/ArrowDown/Home/End giữa các nút chọn trong list picker (gắn vào `<ul onKeyDown>`).
 * Tab vẫn đi qua từng nút như bình thường; chỉ bổ sung điều hướng mũi tên.
 */
export function handlePickerListKeyDown(event) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll('button:not([disabled])'));
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement);
  let next = index;
  if (event.key === 'ArrowDown') next = index < 0 ? 0 : Math.min(index + 1, buttons.length - 1);
  else if (event.key === 'ArrowUp') next = index < 0 ? 0 : Math.max(index - 1, 0);
  else if (event.key === 'Home') next = 0;
  else next = buttons.length - 1;
  event.preventDefault();
  buttons[next].focus();
}
