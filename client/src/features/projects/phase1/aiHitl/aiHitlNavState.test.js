/**
 * AI HITL nav entry helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAiHitlIncomplete,
  resolveAiProjectEntryPath,
  resolvePostHitlProjectPath,
  resolveHitlBackPath,
} from './aiHitlNavState.js';

describe('aiHitlNavState', () => {
  it('AI draft RA + pack draft → incomplete', () => {
    assert.equal(
      isAiHitlIncomplete({
        project: { deliveryPhase: 'requirement_analysis', status: 'draft' },
        pack: { overview: { analysisMode: 'ai' }, status: 'draft', _id: 'p1' },
      }),
      true
    );
  });

  it('manual RA → not incomplete', () => {
    assert.equal(
      isAiHitlIncomplete({
        project: { deliveryPhase: 'requirement_analysis', status: 'draft' },
        pack: { overview: { analysisMode: 'manual' }, status: 'draft' },
      }),
      false
    );
  });

  it('Project.analysisMode=ai without pack overview → incomplete', () => {
    assert.equal(
      isAiHitlIncomplete({
        project: {
          deliveryPhase: 'requirement_analysis',
          status: 'draft',
          analysisMode: 'ai',
        },
        pack: { status: 'draft', _id: 'p1' },
      }),
      true
    );
  });

  it('promoted development → not incomplete', () => {
    assert.equal(
      isAiHitlIncomplete({
        project: { deliveryPhase: 'development', status: 'in_development' },
        pack: { overview: { analysisMode: 'ai' }, status: 'project_linked' },
      }),
      false
    );
  });

  it('pack project_linked → not incomplete', () => {
    assert.equal(
      isAiHitlIncomplete({
        project: { deliveryPhase: 'requirement_analysis', status: 'draft' },
        pack: { overview: { analysisMode: 'ai' }, status: 'project_linked' },
      }),
      false
    );
  });

  it('resolveAiProjectEntryPath → HITL for incomplete AI', () => {
    const path = resolveAiProjectEntryPath({
      projectId: 'proj1',
      project: { deliveryPhase: 'requirement_analysis', status: 'draft', defaultBoardId: 'b1' },
      pack: { _id: 'pack1', overview: { analysisMode: 'ai' }, status: 'under_review' },
      boardId: 'b1',
    });
    assert.match(path, /\/app\/projects\/proj1\/ai-hitl/);
    assert.match(path, /packId=pack1/);
  });

  it('resolveAiProjectEntryPath → Phase2 board for promoted', () => {
    const path = resolveAiProjectEntryPath({
      projectId: 'proj1',
      project: { deliveryPhase: 'development', status: 'in_development', defaultBoardId: 'b1' },
      pack: { _id: 'pack1', overview: { analysisMode: 'ai' }, status: 'project_linked' },
    });
    assert.match(path, /\/app\/projects\/proj1\/board/);
  });

  it('resolvePostHitlProjectPath defaults to development home', () => {
    const path = resolvePostHitlProjectPath({
      projectId: 'proj1',
      project: { deliveryPhase: 'development' },
      boardId: 'b1',
    });
    assert.match(path, /\/board/);
  });

  it('resolveHitlBackPath incomplete → picker', () => {
    assert.equal(
      resolveHitlBackPath({
        projectId: 'proj1',
        project: { deliveryPhase: 'requirement_analysis', status: 'draft' },
        pack: { overview: { analysisMode: 'ai' }, status: 'draft' },
      }),
      '/app/projects'
    );
  });
});
