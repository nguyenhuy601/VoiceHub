import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildProjectLandingCard,
  formatLandingDeadline,
  projectHealthDotClass,
  projectHealthLabelKey,
  projectPriorityLabelKey,
  projectStatusLabelKey,
  resolveLandingDeadlineRaw,
  resolveLandingNextHintKey,
} from './projectLandingCardModel.js';

test('buildProjectLandingCard maps Tier 1–2 fields', () => {
  const card = buildProjectLandingCard(
    {
      _id: 'p1',
      title: 'Cafe Ops',
      projectCode: 'QLDAC-1',
      description: 'Desc',
      status: 'in_development',
      priority: 'high',
      health: 'on_track',
      progressPercent: 68.2,
      expectedEndDate: '2026-11-30T00:00:00.000Z',
      visibility: 'private',
      memberCount: 12,
      pm: { userId: 'u1', displayName: 'Nguyễn A' },
      access: { informationLevel: 'details' },
    },
    'vi'
  );
  assert.equal(card.name, 'Cafe Ops');
  assert.equal(card.projectCode, 'QLDAC-1');
  assert.equal(card.progressPercent, 68);
  assert.equal(card.statusLabelKey, 'workspace.projectHubProjectStatus_in_development');
  assert.equal(card.priorityLabelKey, 'workspace.projectHubPriorityHigh');
  assert.equal(card.healthLabelKey, 'workspace.projectLandingHealth_on_track');
  assert.equal(card.healthDotClass, 'bg-success');
  assert.equal(card.hasPm, true);
  assert.equal(card.pmDisplayName, 'Nguyễn A');
  assert.equal(card.nextHintLabelKey, null);
  assert.ok(card.deadlineLabel.includes('11') || card.deadlineLabel.includes('30'));
});

test('buildProjectLandingCard null-safe progress and pm', () => {
  const card = buildProjectLandingCard({
    _id: 'p2',
    title: 'X',
    status: 'planning',
    progressPercent: null,
    pm: null,
  });
  assert.equal(card.progressPercent, null);
  assert.equal(card.hasPm, false);
  assert.equal(card.healthLabelKey, null);
});

test('formatLandingDeadline returns empty for invalid', () => {
  assert.equal(formatLandingDeadline(null), '');
  assert.equal(formatLandingDeadline('not-a-date'), '');
});

test('resolveLandingDeadlineRaw prefers expectedEndDate', () => {
  assert.equal(
    resolveLandingDeadlineRaw({
      expectedEndDate: 'a',
      dueDate: 'b',
    }),
    'a'
  );
  assert.equal(resolveLandingDeadlineRaw({ dueDate: 'b' }), 'b');
});

test('label key helpers', () => {
  assert.equal(projectStatusLabelKey('on_hold'), 'workspace.projectHubProjectStatus_on_hold');
  assert.equal(projectStatusLabelKey('nope'), null);
  assert.equal(projectPriorityLabelKey('urgent'), 'workspace.projectHubPriorityUrgent');
  assert.equal(projectHealthLabelKey('delayed'), 'workspace.projectLandingHealth_delayed');
  assert.equal(projectHealthDotClass('at_risk'), 'bg-warning');
});

test('resolveLandingNextHintKey — Phase 3 gates after 100% board', () => {
  assert.equal(
    resolveLandingNextHintKey({
      status: 'in_development',
      deliveryPhase: 'qa_uat',
      progressPercent: 100,
      releaseReadyStatus: 'none',
      uatStatus: 'none',
    }),
    'workspace.projectLandingNext_confirmReleaseReadyAt100'
  );
  assert.equal(
    resolveLandingNextHintKey({
      status: 'in_development',
      deliveryPhase: 'qa_uat',
      progressPercent: 40,
      releaseReadyStatus: 'none',
    }),
    'workspace.projectLandingNext_confirmReleaseReady'
  );
  assert.equal(
    resolveLandingNextHintKey({
      deliveryPhase: 'qa_uat',
      releaseReadyStatus: 'confirmed',
      uatStatus: 'none',
      progressPercent: 100,
    }),
    'workspace.projectLandingNext_uatPass'
  );
  assert.equal(
    resolveLandingNextHintKey({
      deliveryPhase: 'qa_uat',
      releaseReadyStatus: 'confirmed',
      uatStatus: 'pass',
    }),
    'workspace.projectLandingNext_advancePhase4'
  );
  assert.equal(
    resolveLandingNextHintKey({
      deliveryPhase: 'release_handover',
      progressPercent: 100,
    }),
    'workspace.projectLandingNext_phase4Handover'
  );
  assert.equal(
    resolveLandingNextHintKey({
      deliveryPhase: 'development',
      progressPercent: 100,
    }),
    'workspace.projectLandingNext_advanceQaUat'
  );
  assert.equal(
    resolveLandingNextHintKey({
      status: 'closed',
      deliveryPhase: 'qa_uat',
      progressPercent: 100,
    }),
    null
  );
  assert.equal(
    resolveLandingNextHintKey({
      status: 'in_development',
      progressPercent: 100,
    }),
    'workspace.projectLandingNext_boardCompleteOpenGates'
  );
});

test('buildProjectLandingCard exposes nextHintLabelKey for Phase 3 at 100%', () => {
  const card = buildProjectLandingCard({
    _id: 'p3',
    title: 'VTXK',
    status: 'in_development',
    deliveryPhase: 'qa_uat',
    progressPercent: 100,
    releaseReadyStatus: 'none',
    uatStatus: 'none',
  });
  assert.equal(card.nextHintLabelKey, 'workspace.projectLandingNext_confirmReleaseReadyAt100');
});
