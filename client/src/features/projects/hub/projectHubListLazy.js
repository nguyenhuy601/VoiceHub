/** List tree: mặc định thu gọn; chevron khi chưa load / đang load / đã có con. */

export function flattenExpandedRows(nodes, expandedIds) {
  const open = expandedIds instanceof Set ? expandedIds : new Set();
  const out = [];
  const walk = (list, depth) => {
    for (const node of list || []) {
      out.push({ node, depth });
      if (open.has(node.id) && node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

export function canExpandListRow({ childTypes = [], loaded = false, loading = false, hasChildren = false } = {}) {
  if (loading || hasChildren) return true;
  if (!loaded && Array.isArray(childTypes) && childTypes.length > 0) return true;
  return false;
}
