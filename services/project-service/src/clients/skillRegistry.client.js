/**
 * Skill registry S2S client — soft stub when registry service/env chưa cấu hình.
 * isRegistryEnabled() mặc định false → AI planning bỏ qua registry match.
 */

function isRegistryEnabled() {
  const raw = String(process.env.SKILL_REGISTRY_ENABLED || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * @param {string} _organizationId
 * @param {Iterable<string>|string[]} _skillIds
 * @returns {Promise<object[]>}
 */
async function fetchSkillsByIds(_organizationId, _skillIds) {
  return [];
}

module.exports = {
  isRegistryEnabled,
  fetchSkillsByIds,
};
