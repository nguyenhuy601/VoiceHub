/**
 * Map WorkflowDefinition.states ↔ CatalogKeyLabelEditor (Admin Status + Project Settings).
 * Giữ key/label/order/isInitial/isFinal — không ép category kiểu template.
 */

import { repairUtf8Mojibake } from '../../../utils/utf8Mojibake.js';

export function statesToEditorItems(states = []) {
  return (Array.isArray(states) ? states : [])
    .map((s, i) => {
      const key = String(s?.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: repairUtf8Mojibake(String(s.label || key).trim()) || key,
        order: Number(s.order ?? s.sortOrder) || i + 1,
        isInitial: Boolean(s.isInitial),
        isFinal: Boolean(s.isFinal),
      };
    })
    .filter(Boolean);
}

export function mergeEditorItemsToStates(items = [], prevStates = []) {
  const byKey = new Map(
    (Array.isArray(prevStates) ? prevStates : []).map((s) => [String(s.key), s])
  );
  const rows = Array.isArray(items) ? items : [];
  return rows
    .map((item, i) => {
      const key = String(item?.key || '').trim();
      if (!key) return null;
      const old = byKey.get(key);
      return {
        key,
        label: repairUtf8Mojibake(String(item.label || key).trim()) || key,
        order: i + 1,
        isInitial: Boolean(old?.isInitial) || i === 0,
        isFinal: Boolean(old?.isFinal) || i === rows.length - 1,
      };
    })
    .filter(Boolean);
}

export function filterTransitionsByStateKeys(transitions = [], states = []) {
  const keys = new Set((Array.isArray(states) ? states : []).map((s) => String(s.key)));
  return (Array.isArray(transitions) ? transitions : []).filter(
    (tr) => keys.has(String(tr.fromKey)) && keys.has(String(tr.toKey))
  );
}

/**
 * Đảm bảo cạnh thuận liền kề theo order (status mới không mồ côi).
 * Giữ transition cũ; chỉ bổ sung thiếu.
 */
export function ensureAdjacentTransitions(transitions = [], states = []) {
  const ordered = [...(Array.isArray(states) ? states : [])]
    .map((s, i) => ({
      key: String(s?.key || '').trim(),
      order: Number(s?.order ?? s?.sortOrder) || i + 1,
    }))
    .filter((s) => s.key)
    .sort((a, b) => a.order - b.order);
  const keys = ordered.map((s) => s.key);
  const next = [...(Array.isArray(transitions) ? transitions : [])];
  const edgeSet = new Set(next.map((tr) => `${String(tr.fromKey)}→${String(tr.toKey)}`));
  for (let i = 0; i < keys.length - 1; i += 1) {
    const fromKey = keys[i];
    const toKey = keys[i + 1];
    const id = `${fromKey}→${toKey}`;
    if (edgeSet.has(id)) continue;
    next.push({
      fromKey,
      toKey,
      name: `${fromKey} → ${toKey}`,
    });
    edgeSet.add(id);
  }
  return filterTransitionsByStateKeys(next, ordered);
}

/**
 * Giữ cạnh Reopen từ Done → trạng thái làm việc (template Startup/SME).
 * Khi thêm status sau Done (cancelled, …), save Settings có thể chỉ còn cạnh liền kề
 * nếu Reopen từng bị mất — khôi phục khi cả hai key còn trên board.
 */
export function ensureReopenFromDone(transitions = [], states = []) {
  const arr = Array.isArray(states) ? states : [];
  const keys = new Set(arr.map((s) => String(s?.key || '').trim()).filter(Boolean));
  if (!keys.has('done')) {
    return filterTransitionsByStateKeys(transitions, arr);
  }
  const workKey = keys.has('in_progress')
    ? 'in_progress'
    : keys.has('doing')
      ? 'doing'
      : keys.has('dev')
        ? 'dev'
        : null;
  if (!workKey) {
    return filterTransitionsByStateKeys(transitions, arr);
  }
  const next = [...(Array.isArray(transitions) ? transitions : [])];
  const hasReopen = next.some(
    (tr) => String(tr?.fromKey) === 'done' && String(tr?.toKey) === workKey
  );
  if (!hasReopen) {
    next.push({ fromKey: 'done', toKey: workKey, name: 'Reopen' });
  }
  return filterTransitionsByStateKeys(next, arr);
}
