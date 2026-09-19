import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateIntakeFile,
  buildIntakeUploadQueue,
  MAX_FILES_PER_GROUP,
  INTAKE_DOC_CLASS,
  emptyIntakeFiles,
  countIntakeFiles,
} from './projectWizardInputFiles.js';

function fakeFile(name, size) {
  return { name, size };
}

describe('validateIntakeFile', () => {
  it('accepts pdf within size', () => {
    assert.deepEqual(validateIntakeFile(fakeFile('a.pdf', 100)), { ok: true });
  });

  it('rejects bad extension', () => {
    assert.equal(validateIntakeFile(fakeFile('a.exe', 100)).reason, 'ext');
  });

  it('rejects oversized', () => {
    assert.equal(validateIntakeFile(fakeFile('a.pdf', 21 * 1024 * 1024)).reason, 'size');
  });

  it('rejects empty', () => {
    assert.equal(validateIntakeFile(fakeFile('a.pdf', 0)).reason, 'empty');
    assert.equal(validateIntakeFile(null).reason, 'empty');
  });
});

describe('buildIntakeUploadQueue', () => {
  it('orders requirement then customerFiles then references', () => {
    const q = buildIntakeUploadQueue({
      requirement: fakeFile('req.pdf', 10),
      customerFiles: [fakeFile('c1.docx', 10), fakeFile('c2.xlsx', 10)],
      references: [fakeFile('r1.png', 10)],
    });
    assert.equal(q.length, 4);
    assert.equal(q[0].docClass, INTAKE_DOC_CLASS.requirement);
    assert.equal(q[1].group, 'customerFiles');
    assert.equal(q[3].docClass, INTAKE_DOC_CLASS.references);
  });

  it('skips missing requirement', () => {
    const q = buildIntakeUploadQueue({ ...emptyIntakeFiles(), customerFiles: [fakeFile('c.pdf', 1)] });
    assert.equal(q.length, 1);
  });
});

describe('countIntakeFiles', () => {
  it('counts groups', () => {
    const c = countIntakeFiles({
      requirement: fakeFile('r.pdf', 1),
      customerFiles: [fakeFile('a.pdf', 1)],
      references: [],
    });
    assert.equal(c.total, 2);
    assert.equal(c.requirement, 1);
  });

  it('exposes max per group', () => {
    assert.equal(MAX_FILES_PER_GROUP, 10);
  });
});
