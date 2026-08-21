function parseDateValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
  parseDateValue,
};
