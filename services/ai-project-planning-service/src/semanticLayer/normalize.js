/**
 * Format normalization only. Business wording stays as written (RULE-SL-02).
 */

const HOURS = /^(\d+(?:[.,]\d+)?)\s*(giờ|gio|h|hr|hrs|hour|hours)$/i;
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function collapseSpaces(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeIntake(raw = {}) {
  const fields = {};
  for (const [key, value] of Object.entries(raw)) {
    fields[key] = typeof value === 'string' ? collapseSpaces(value) : value;
  }

  let hours = null;
  if (typeof fields.hours === 'number' && Number.isFinite(fields.hours)) {
    hours = fields.hours;
  } else if (typeof fields.hours === 'string') {
    const match = fields.hours.match(HOURS);
    if (match) hours = Number(match[1].replace(',', '.'));
  }

  let dueOn = null;
  if (typeof fields.due === 'string') {
    const match = fields.due.match(DMY);
    if (match) dueOn = `${match[3]}-${match[2]}-${match[1]}`;
  }

  return {
    original: raw,
    fields,
    hours,
    dueOn,
  };
}

module.exports = {
  normalizeIntake,
};
