/**
 * Position (jobTitle) — preferences.jobTitle là SoT khi key đã tồn tại (kể cả rỗng).
 */

function coalesceJobTitle(profile) {
  const pref = profile?.preferences;
  if (pref && Object.prototype.hasOwnProperty.call(pref, 'jobTitle')) {
    return String(pref.jobTitle || '').trim();
  }
  return String(profile?.jobTitle || '').trim();
}

module.exports = {
  coalesceJobTitle,
};
