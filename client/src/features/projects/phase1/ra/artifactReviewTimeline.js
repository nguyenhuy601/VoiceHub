/**
 * DEC R1 — BA → Tech → PO review timeline from AnalysisArtifact.review (no User populate).
 */
import { formatActorRef } from './srsEmptyAudit.js';

/** @typedef {'ba'|'tech'|'po'} ReviewGateId */

/** @type {readonly ReviewGateId[]} */
export const REVIEW_GATE_ORDER = Object.freeze(['ba', 'tech', 'po']);

/**
 * @param {unknown} stamp
 * @returns {{ userId: string, at: string|null, note: string, done: boolean, actorRef: string }}
 */
export function normalizeReviewStamp(stamp) {
  const raw = stamp && typeof stamp === 'object' ? stamp : {};
  const userId = String(raw.userId || raw.user || '').trim();
  const atRaw = raw.at || raw.reviewedAt || null;
  const at = atRaw ? String(atRaw) : null;
  const note = String(raw.note || '').trim();
  const done = Boolean(at || userId);
  return {
    userId,
    at,
    note,
    done,
    actorRef: formatActorRef(userId),
  };
}

/**
 * @param {object} [artifact]
 * @returns {{ gate: ReviewGateId, labelKey: string, stamp: ReturnType<typeof normalizeReviewStamp> }[]}
 */
export function listArtifactReviewTimeline(artifact) {
  const review = artifact?.review && typeof artifact.review === 'object' ? artifact.review : {};
  return REVIEW_GATE_ORDER.map((gate) => ({
    gate,
    labelKey: `workspace.phase1ReviewGate${gate.charAt(0).toUpperCase()}${gate.slice(1)}`,
    stamp: normalizeReviewStamp(review[gate]),
  }));
}
