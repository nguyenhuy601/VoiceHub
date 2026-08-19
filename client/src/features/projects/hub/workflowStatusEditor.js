/**
 * Map WorkflowDefinition.states ↔ CatalogKeyLabelEditor (Admin Status + Project Settings).
 * Giữ key/label/order/isInitial/isFinal — không ép category kiểu template.
 */

export function statesToEditorItems(states = []) {
  return (Array.isArray(states) ? states : [])
    .map((s, i) => {
      const key = String(s?.key || '').trim();
      if (!key) return null;
      return {
        key,
        label: String(s.label || key).trim() || key,
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
        label: String(item.label || key).trim() || key,
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
