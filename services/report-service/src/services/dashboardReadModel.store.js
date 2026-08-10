/**
 * Pure dashboard RM upsert — unit-testable without Redis.
 * Shape khớp BFF buildDashboardSummary (+ asOf).
 */

const { isUsableDashboardSummary } = require('@enterprise/shared/utils/dashboardReadModelShape');

const MAX_PROCESSED_EVENTS = 64;

function emptyDashboardSummary(userId) {
  return {
    userId: userId ? String(userId) : undefined,
    orgCount: 0,
    friendsTotal: 0,
    pendingCount: 0,
    unread: 0,
    taskDone: 0,
    upcomingMeetings: [],
    partial: {
      organizations: false,
      friends: false,
      pending: false,
      notifications: false,
      meetings: false,
      tasks: false,
    },
    asOf: null,
    processedEventIds: [],
  };
}

function cloneSummary(doc) {
  return {
    ...emptyDashboardSummary(doc?.userId),
    ...doc,
    upcomingMeetings: Array.isArray(doc?.upcomingMeetings) ? [...doc.upcomingMeetings] : [],
    partial: { ...emptyDashboardSummary().partial, ...(doc?.partial || {}) },
    processedEventIds: Array.isArray(doc?.processedEventIds) ? [...doc.processedEventIds] : [],
  };
}

/**
 * @param {object} current
 * @param {{ eventId?: string, userId?: string, patch?: object, asOf?: string }} input
 * @returns {{ next: object, applied: boolean }}
 */
function upsertDashboardSummary(current, input = {}) {
  const eventId = String(input.eventId || '').trim();
  const base = cloneSummary(current);
  if (input.userId) base.userId = String(input.userId);

  if (eventId && base.processedEventIds.includes(eventId)) {
    return { next: base, applied: false };
  }

  const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
  const next = cloneSummary({ ...base, ...patch, userId: base.userId });
  if (patch.partial && typeof patch.partial === 'object') {
    next.partial = { ...base.partial, ...patch.partial };
  }
  if (Array.isArray(patch.upcomingMeetings)) {
    next.upcomingMeetings = patch.upcomingMeetings.slice(0, 5);
  }
  next.asOf = input.asOf || patch.asOf || new Date().toISOString();

  if (eventId) {
    next.processedEventIds = [...base.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);
  }
  return { next, applied: true };
}

function applyTaskFactPatch(current, payload = {}) {
  const next = cloneSummary(current);
  if (payload.taskDone != null && Number.isFinite(Number(payload.taskDone))) {
    next.taskDone = Number(payload.taskDone);
    next.partial = { ...next.partial, tasks: false };
    return next;
  }
  const delta = Number(payload.doneDelta);
  if (Number.isFinite(delta) && delta !== 0) {
    const prev = Number.isFinite(Number(next.taskDone)) ? Number(next.taskDone) : 0;
    next.taskDone = Math.max(0, prev + delta);
    next.partial = { ...next.partial, tasks: false };
  }
  return next;
}

function toPublicDashboardSummary(doc) {
  if (!doc) return null;
  return {
    orgCount: Number(doc.orgCount) || 0,
    friendsTotal: Number(doc.friendsTotal) || 0,
    pendingCount: Number(doc.pendingCount) || 0,
    unread: Number(doc.unread) || 0,
    taskDone: doc.taskDone == null ? null : Number(doc.taskDone),
    upcomingMeetings: Array.isArray(doc.upcomingMeetings) ? doc.upcomingMeetings : [],
    partial: doc.partial || emptyDashboardSummary().partial,
    asOf: doc.asOf || null,
  };
}

module.exports = {
  emptyDashboardSummary,
  isUsableDashboardSummary,
  cloneSummary,
  upsertDashboardSummary,
  applyTaskFactPatch,
  toPublicDashboardSummary,
  MAX_PROCESSED_EVENTS,
};
