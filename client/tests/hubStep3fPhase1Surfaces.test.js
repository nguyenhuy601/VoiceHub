import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  PHASE1_PLANNING_MODULES,
  PHASE1_RA_MODULES,
} from '../src/features/projects/phase1/nav/phase1NavConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('hub Step 3f Phase1 surfaces (W7-8)', () => {
  it('ProjectModuleRoute mounts Phase1Shell', () => {
    const routePath = join(
      __dirname,
      '../src/features/projects/hub/ProjectModuleRoute.jsx'
    );
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /Phase1Shell/);
    assert.match(src, /from '\.\.\/phase1\/Phase1Shell'/);
  });

  it('phase1NavConfig includes RA and planning primary modules', () => {
    const ra = PHASE1_RA_MODULES.map((m) => m.module);
    const planning = PHASE1_PLANNING_MODULES.map((m) => m.module);
    assert.ok(ra.includes('overview'));
    assert.ok(ra.includes('customer-documents'));
    assert.ok(ra.includes('analysis-reviews'));
    assert.ok(ra.includes('srs-baselines'));
    assert.ok(planning.includes('planning-overview'));
    assert.ok(planning.includes('planning-resources'));
  });
});
