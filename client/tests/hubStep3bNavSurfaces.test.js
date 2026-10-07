import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PROJECT_HUB_TABS } from '../src/features/projects/hub/projectHubUtils.js';

describe('hub Step 3b nav surfaces (W7-8)', () => {
  it('PROJECT_HUB_TABS includes members, settings, testCases', () => {
    const ids = PROJECT_HUB_TABS.map((tab) => tab.id);
    assert.ok(ids.includes('members'));
    assert.ok(ids.includes('settings'));
    assert.ok(ids.includes('testCases'));
  });

  it('label keys point at workspace hub tabs', () => {
    const members = PROJECT_HUB_TABS.find((tab) => tab.id === 'members');
    const settings = PROJECT_HUB_TABS.find((tab) => tab.id === 'settings');
    const testCases = PROJECT_HUB_TABS.find((tab) => tab.id === 'testCases');
    assert.equal(members.labelKey, 'workspace.projectHubTabMembers');
    assert.equal(settings.labelKey, 'workspace.projectHubTabSettings');
    assert.equal(testCases.labelKey, 'workspace.phaseQaTestCasesTitle');
  });
});
