/**
 * Position (jobTitle) — preferences.jobTitle là SoT khi key đã tồn tại (kể cả rỗng).
 * Top-level jobTitle giữ tương thích mời/import; dual-write khi admin PATCH.
 */

function coalesceJobTitle(profile) {
  const pref = profile?.preferences;
  if (pref && Object.prototype.hasOwnProperty.call(pref, 'jobTitle')) {
    return String(pref.jobTitle || '').trim();
  }
  return String(profile?.jobTitle || '').trim();
}

function normalizeJobTitleForSave(raw) {
  return String(raw || '').trim().slice(0, 120);
}

module.exports = {
  coalesceJobTitle,
  normalizeJobTitleForSave,
};
