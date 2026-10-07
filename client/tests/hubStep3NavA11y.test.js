import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { PROJECT_HUB_TABS } from '../src/features/projects/hub/projectHubUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(
  join(__dirname, '../src/features/projects/hub/ProjectHubShell.jsx'),
  'utf8'
);

describe('hub Step 3 nav a11y (W7-8)', () => {
  it('PROJECT_HUB_TABS includes Change Requests module', () => {
    const cr = PROJECT_HUB_TABS.find((tab) => tab.id === 'changeRequests');
    assert.ok(cr);
    assert.equal(cr.labelKey, 'workspace.projectHubTabChangeRequests');
  });

  it('ProjectHubShell tab bar exposes tablist + tab roles', () => {
    assert.match(shellSource, /role="tablist"/);
    assert.match(shellSource, /role="tab"/);
    assert.match(shellSource, /aria-selected=\{active\}/);
  });
});
