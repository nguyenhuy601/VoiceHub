/**
 * Collaboration / Operations sidebar paths must stay under /app/projects/:id/*.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getProjectsPostSelectNavItems,
  PROJECT_MENU_GROUPS,
} from './suiteNavConfig.js';
import { PROJECT_COLLAB_OPS_MODULES } from './projectPhaseNav.js';

describe('suiteNav Collaboration / Operations paths', () => {
  const projectId = 'projCollabOps01';

  for (const phase of ['requirement_analysis', 'delivery_planning', 'development']) {
    it(`builds project-scoped paths for ${phase}`, () => {
      const items = getProjectsPostSelectNavItems(projectId, {
        deliveryPhase: phase,
        capabilities: { canViewAnalysis: true, canViewPlanning: true },
        aiHitlIncomplete: false,
      });
      const collabOps = items.filter(
        (i) =>
          i.group === PROJECT_MENU_GROUPS.COLLAB || i.group === PROJECT_MENU_GROUPS.OPS
      );
      assert.ok(collabOps.length >= 2, `expected collab/ops items for ${phase}`);
      for (const item of collabOps) {
        assert.equal(
          item.path,
          `/app/projects/${projectId}/${item.pathSeg || item.module}`,
          `${item.key} path`
        );
        assert.ok(
          !item.path.includes('/app/company/'),
          `${item.key} must not use company suite`
        );
        assert.ok(
          !item.path.includes('/app/collaborate/'),
          `${item.key} must not use legacy collaborate`
        );
      }
    });
  }

  it('keeps collab/ops when Phase 0 aiHitlIncomplete', () => {
    const items = getProjectsPostSelectNavItems(projectId, {
      deliveryPhase: 'requirement_analysis',
      capabilities: { canViewAnalysis: true, canViewPlanning: true },
      aiHitlIncomplete: true,
    });
    const modules = items.map((i) => i.module);
    for (const mod of PROJECT_COLLAB_OPS_MODULES) {
      assert.ok(modules.includes(mod), `expected ${mod} in Phase 0 sidebar`);
    }
    const chat = items.find((i) => i.module === 'chat');
    assert.equal(chat?.path, `/app/projects/${projectId}/chat`);
  });
});
