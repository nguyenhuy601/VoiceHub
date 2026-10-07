import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { PROJECT_HUB_TABS } from '../src/features/projects/hub/projectHubUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('hub Step 3e nav surfaces (W7-8)', () => {
  it('PROJECT_HUB_TABS includes overview and chat', () => {
    const ids = PROJECT_HUB_TABS.map((tab) => tab.id);
    assert.ok(ids.includes('overview'));
    assert.ok(ids.includes('chat'));
  });

  it('ProjectModuleRoute mounts Phase4Shell', () => {
    const routePath = join(
      __dirname,
      '../src/features/projects/hub/ProjectModuleRoute.jsx'
    );
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /Phase4Shell/);
    assert.match(src, /from '\.\/phase4\/Phase4Shell'/);
  });
});
