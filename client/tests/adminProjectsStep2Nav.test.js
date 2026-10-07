import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_DOMAINS } from '../src/config/adminDomainsConfig.js';

const projectsDomain = ADMIN_DOMAINS.find((d) => d.id === 'projects');
const projectItems = projectsDomain.sections.flatMap((s) => s.items);

function findItem(id) {
  return projectItems.find((i) => i.id === id);
}

describe('admin projects nav (W7-8 Step 2)', () => {
  it('overview and boards share the tasks-boards implementation', () => {
    assert.equal(findItem('overview')?.implementation, 'tasks-boards');
    assert.equal(findItem('boards')?.implementation, 'tasks-boards');
  });

  it('Step 2 polished panels are reachable from nav', () => {
    for (const id of [
      'overview',
      'boards',
      'settings',
      'project-team',
      'workflow',
      'sprints',
      'manage-tasks',
      'briefs',
      'labels',
      'transfer',
      'capacity',
      'planner',
    ]) {
      const item = findItem(id);
      assert.ok(item, `missing nav item: ${id}`);
      assert.ok(item.implementation, `missing implementation: ${id}`);
    }
  });

  it('sprints nav uses the projects label key', () => {
    assert.equal(findItem('sprints')?.labelKey, 'adminDomains.projects.sprints');
  });
});
