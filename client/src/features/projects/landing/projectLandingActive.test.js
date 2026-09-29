import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isProjectActiveForUi,
  isProjectCompletedForUi,
  isProjectDraftForUi,
  isProjectFinishedForUi,
  isProjectListableForUi,
  isProjectReadyForPlanningForUi,
} from './projectLandingActive.js';

describe('projectLandingActive', () => {
  it('puts closed only on the finished tab', () => {
    const closed = { status: 'closed', isActive: true };
    assert.equal(isProjectCompletedForUi(closed), true);
    assert.equal(isProjectFinishedForUi(closed), true);
    assert.equal(isProjectActiveForUi(closed), false);
    assert.equal(isProjectDraftForUi(closed), false);
    assert.equal(isProjectReadyForPlanningForUi(closed), false);
    assert.equal(isProjectListableForUi(closed), true);
  });

  it('treats requirement_analysis as draft, not ready', () => {
    const ra = { status: 'ready', deliveryPhase: 'requirement_analysis', isActive: true };
    assert.equal(isProjectDraftForUi(ra), true);
    assert.equal(isProjectReadyForPlanningForUi(ra), false);
    assert.equal(isProjectActiveForUi(ra), false);
    assert.equal(isProjectListableForUi({ status: 'draft', deliveryPhase: 'requirement_analysis', isActive: true }), true);
  });

  it('treats a missing phase as development, same as the hub', () => {
    const legacy = { status: 'draft', deliveryPhase: '', isActive: true };
    assert.equal(isProjectActiveForUi(legacy), true);
    assert.equal(isProjectDraftForUi(legacy), false);
    assert.equal(isProjectReadyForPlanningForUi(legacy), false);
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: true }), true);
    assert.equal(isProjectDraftForUi({ status: 'planning', isActive: true }), false);
    assert.equal(isProjectListableForUi({ status: 'draft', isActive: true }), true);
  });

  it('treats delivery_planning and ready_for_planning as the not-yet-active tab', () => {
    const planning = { status: 'draft', deliveryPhase: 'delivery_planning', isActive: true };
    assert.equal(isProjectReadyForPlanningForUi(planning), true);
    assert.equal(isProjectDraftForUi(planning), false);
    assert.equal(isProjectActiveForUi(planning), false);
    const alias = { status: 'ready_for_planning', deliveryPhase: 'legacy', isActive: true };
    assert.equal(isProjectReadyForPlanningForUi(alias), true);
    assert.equal(isProjectDraftForUi(alias), false);
    assert.equal(isProjectActiveForUi(alias), false);
    assert.equal(isProjectListableForUi(alias), true);
  });

  it('groups phase 2–4 and on_hold on the active tab', () => {
    assert.equal(isProjectActiveForUi({ status: 'in_development', isActive: true }), true);
    assert.equal(isProjectActiveForUi({ status: 'qa_uat', deliveryPhase: 'qa_uat', isActive: true }), true);
    assert.equal(
      isProjectActiveForUi({ status: 'release_handover', deliveryPhase: 'release_handover', isActive: true }),
      true
    );
    assert.equal(
      isProjectActiveForUi({ status: 'ready_for_planning', deliveryPhase: 'qa_uat', isActive: true }),
      true
    );
    assert.equal(
      isProjectReadyForPlanningForUi({ status: 'ready_for_planning', deliveryPhase: 'release_handover', isActive: true }),
      false
    );
    assert.equal(isProjectActiveForUi({ status: 'on_hold', deliveryPhase: 'qa_uat', isActive: true }), true);
    assert.equal(isProjectReadyForPlanningForUi({ status: 'qa_uat', isActive: true }), false);
    assert.equal(isProjectDraftForUi({ status: 'in_development', isActive: true }), false);
    assert.equal(isProjectListableForUi({ status: 'on_hold', isActive: true }), true);
  });

  it('treats isActive false as completed / not listable', () => {
    assert.equal(isProjectCompletedForUi({ status: 'draft', isActive: false }), true);
    assert.equal(isProjectFinishedForUi({ status: 'closed', isActive: false }), false);
    assert.equal(isProjectActiveForUi({ status: 'draft', isActive: false }), false);
    assert.equal(isProjectDraftForUi({ status: 'draft', isActive: false }), false);
    assert.equal(isProjectReadyForPlanningForUi({ status: 'ready', isActive: false }), false);
    assert.equal(isProjectListableForUi({ status: 'draft', isActive: false }), false);
  });
});
