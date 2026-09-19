/**
 * SSOT — Project lifecycle status, phaseStatus, analysisMode.
 * Orthogonal to deliveryPhase (see projectDeliveryPhase.js).
 */

const PROJECT_STATUSES = Object.freeze(['draft', 'active', 'on_hold', 'closed']);

const PHASE_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'review',
  'approved',
  'blocked',
  'completed',
]);

const ANALYSIS_MODES = Object.freeze(['manual', 'ai']);

/** Legacy terminal statuses written before enum chỉ còn `closed`. */
const LEGACY_TERMINAL_PROJECT_STATUSES = Object.freeze([
  'cancelled',
  'canceled',
  'completed',
  'archived',
]);

/**
 * Map old 5-value status (+ terminals) → new 4-value status.
 * Keys already in PROJECT_STATUSES are identity (not listed).
 */
const LEGACY_STATUS_MAP = Object.freeze({
  planning: 'draft',
  ready_for_planning: 'draft',
  in_development: 'active',
  cancelled: 'closed',
  canceled: 'closed',
  completed: 'closed',
  archived: 'closed',
});

const DEFAULT_PROJECT_STATUS_NEW = 'draft';
const DEFAULT_PHASE_STATUS_NEW = 'not_started';
const DEFAULT_ANALYSIS_MODE = 'manual';

module.exports = {
  PROJECT_STATUSES,
  PHASE_STATUSES,
  ANALYSIS_MODES,
  LEGACY_TERMINAL_PROJECT_STATUSES,
  LEGACY_STATUS_MAP,
  DEFAULT_PROJECT_STATUS_NEW,
  DEFAULT_PHASE_STATUS_NEW,
  DEFAULT_ANALYSIS_MODE,
};
