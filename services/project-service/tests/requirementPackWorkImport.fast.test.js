const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.ORGANIZATION_SERVICE_URL =
  process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3011';

describe('requirementPackWorkImport.fast', () => {
  it('exports fast import entry', () => {
    const fast = require('../src/utils/requirementPackWorkImport.fast');
    assert.equal(fast.IMPORT_HOURS_RATIONALE, 'requirement_pack_import');
    assert.equal(typeof fast.importRequirementPackWorkItemsFast, 'function');
    assert.equal(typeof fast.preparePackImportContext, 'function');
  });

  it('service delegates to fast path (no createCard per row)', () => {
    const servicePath = path.join(
      __dirname,
      '../src/services/requirementPackWorkImport.service.js'
    );
    const src = fs.readFileSync(servicePath, 'utf8');
    assert.match(src, /importRequirementPackWorkItemsFast/);
    assert.ok(!src.includes('createCard('));
    assert.ok(!src.includes('createPlanningItem('));
  });
});
