const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/** W7-8 Step 3c — đúng 5 controller D3 */
const CONTROLLERS = [
  'projectBrief.controller.js',
  'analysis.controller.js',
  'workPreview.controller.js',
  'governance.controller.js',
  'aiPlanningInternal.controller.js',
];

describe('errorCode controllers round 4 (W7-8 Step 3c)', () => {
  for (const name of CONTROLLERS) {
    it(`${name}: every success:false has errorCode within ~220 chars`, () => {
      const filePath = path.join(__dirname, '..', 'src', 'controllers', name);
      const src = fs.readFileSync(filePath, 'utf8');
      const re = /success\s*:\s*false/g;
      let m;
      let missing = 0;
      while ((m = re.exec(src)) !== null) {
        const window = src.slice(m.index, m.index + 220);
        if (!/\berrorCode\b/.test(window)) missing += 1;
      }
      assert.equal(
        missing,
        0,
        `${name} has ${missing} success:false without nearby errorCode`
      );
    });
  }

  it('package.json keeps xlsx@^0.18.5', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    assert.equal(pkg.dependencies.xlsx, '^0.18.5');
  });
});
