/**
 * Feature flag — MEETING_ALLOCATION_V1 (default on).
 * Set MEETING_ALLOCATION_V1=0 to disable new meeting allocation paths in callers.
 */
function isMeetingAllocationV1Enabled() {
  const raw = String(process.env.MEETING_ALLOCATION_V1 ?? '1').trim().toLowerCase();
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
}

module.exports = { isMeetingAllocationV1Enabled };
