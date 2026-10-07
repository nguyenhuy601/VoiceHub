const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { sendServiceError } = require('../src/middleware/sendServiceError');

const CONTROLLERS = [
  'taskBoard.controller.js',
  'task.controller.js',
  'project.controller.js',
  'changeRequest.controller.js',
  'planning.controller.js',
  'requirement.controller.js',
];

describe('sendServiceError helper', () => {
  it('includes errorCode in JSON body', () => {
    let captured = null;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        captured = body;
        return this;
      },
    };
    sendServiceError(res, 400, {
      errorCode: 'VALIDATION_FAILED',
      messageUser: 'test',
      message: 'test',
    });
    assert.equal(res.statusCode, 400);
    assert.equal(captured.success, false);
    assert.equal(captured.errorCode, 'VALIDATION_FAILED');
  });
});

describe('Hub-hot controllers errorCode coverage', () => {
  for (const name of CONTROLLERS) {
    it(`${name}: every success:false block has errorCode`, () => {
      const filePath = path.join(
        __dirname,
        '..',
        'src',
        'controllers',
        name
      );
      const src = fs.readFileSync(filePath, 'utf8');
      // Split on success: false occurrences; each must have errorCode within ~200 chars
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
});
