/**
 * Staffing proposal audit trail on aiPlanning overlay.
 */

const MAX_AUDIT_EVENTS = 20;

function appendStaffingAuditEvent(overlay, event) {
  const base = overlay && typeof overlay === 'object' ? overlay : {};
  const prev = Array.isArray(base.staffingAudit?.events) ? base.staffingAudit.events : [];
  const nextEvent = {
    action: String(event?.action || '').trim(),
    at: event?.at || new Date().toISOString(),
    userId: event?.userId != null ? String(event.userId) : '',
    validationStatus: event?.validationStatus || null,
    deltaSnapshot:
      event?.deltaSnapshot && typeof event.deltaSnapshot === 'object'
        ? event.deltaSnapshot
        : null,
  };
  const events = [...prev, nextEvent].slice(-MAX_AUDIT_EVENTS);
  return {
    ...base,
    staffingAudit: { events },
  };
}

function buildAuditEventFromOverlay(overlay, { action, userId }) {
  return {
    action,
    at: new Date().toISOString(),
    userId: String(userId || ''),
    validationStatus: overlay?.proposalValidation?.status || null,
    deltaSnapshot: overlay?.proposalValidation?.delta || null,
  };
}

module.exports = {
  MAX_AUDIT_EVENTS,
  appendStaffingAuditEvent,
  buildAuditEventFromOverlay,
};
