import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROJECT_HUB_TABS } from '../src/features/projects/hub/projectHubUtils.js';

describe('hub Step 3d nav surfaces (W7-8)', () => {
  it('PROJECT_HUB_TABS includes board', () => {
    const ids = PROJECT_HUB_TABS.map((tab) => tab.id);
    assert.ok(ids.includes('board'));
  });
});
