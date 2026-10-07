import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROJECT_HUB_TABS } from '../src/features/projects/hub/projectHubUtils.js';

describe('hub Step 3c nav surfaces (W7-8)', () => {
  it('PROJECT_HUB_TABS includes list, planning, timeline', () => {
    const ids = PROJECT_HUB_TABS.map((tab) => tab.id);
    assert.ok(ids.includes('list'));
    assert.ok(ids.includes('planning'));
    assert.ok(ids.includes('timeline'));
  });
});
