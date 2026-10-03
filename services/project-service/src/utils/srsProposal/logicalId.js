/**
 * Stable logical ids for proposal items (Wave 0+).
 */

function toLogicalId(prefix, raw, fallbackIndex = 0) {
  const base = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-.:]/g, '')
    .slice(0, 80);
  if (base) return base.startsWith(prefix) ? base : `${prefix}${base}`;
  return `${prefix}${fallbackIndex + 1}`;
}

function frLogicalId(item, index = 0) {
  return toLogicalId(
    '',
    item?.logicalId || item?.id || item?.frId || item?.key,
    index
  ) || `FR-${index + 1}`;
}

module.exports = {
  toLogicalId,
  frLogicalId,
};
