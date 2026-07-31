const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSkillName,
  SKILL_WHITELIST,
  POSITION_CODES,
} = require('../src/constants/capabilityCatalog');
const {
  emptyCapability,
  sanitizeCapabilityFields,
  applyCapabilityAction,
  toPublicVerifiedCapability,
} = require('../src/services/capabilityProfile.service');

const HR_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = '2026-07-31T10:00:00.000Z';
const JOB_TITLE = 'Senior Backend Developer';

function validFields(overrides = {}) {
  return {
    primaryDomain: 'be',
    yearsExperience: 3,
    skills: [
      { name: 'Node.js', level: 4 },
      { name: 'MongoDB', level: 3 },
    ],
    availability: 'available',
    summary: 'Backend SE',
    ...overrides,
  };
}

describe('capabilityCatalog', () => {
  it('normalizeSkillName maps aliases to whitelist', () => {
    assert.equal(normalizeSkillName('react.js'), 'React');
    assert.equal(normalizeSkillName('K8s'), 'Kubernetes');
    assert.equal(normalizeSkillName('not-a-skill'), null);
    assert.ok(SKILL_WHITELIST.includes('React'));
    assert.ok(POSITION_CODES.includes('dev'));
  });
});

describe('sanitizeCapabilityFields', () => {
  it('drops unknown skills and clamps level', () => {
    const r = sanitizeCapabilityFields({
      skills: [
        { name: 'React', level: 9 },
        { name: 'HackingEvil', level: 5 },
        { name: 'react.js', level: 2 },
      ],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.fields.skills, [{ name: 'React', level: 5 }]);
  });

  it('ignores positionCode (Position SoT = jobTitle)', () => {
    const r = sanitizeCapabilityFields({ positionCode: 'ceo', primaryDomain: 'be' });
    assert.equal(r.ok, true);
    assert.equal(r.fields.positionCode, undefined);
    assert.equal(r.fields.primaryDomain, 'be');
  });
});

describe('applyCapabilityAction FSM', () => {
  it('save_draft keeps draft and ignores injected verified status', () => {
    const r = applyCapabilityAction(emptyCapability(), 'save_draft', {
      fields: {
        ...validFields(),
        verificationStatus: 'verified',
        verifiedBy: HR_ID,
      },
      now: NOW,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capability.verificationStatus, 'draft');
    assert.equal(r.capability.primaryDomain, 'be');
    assert.equal(r.capability.skills.length, 2);
  });

  it('submit → pending_hr when jobTitle present', () => {
    const current = {
      ...emptyCapability(),
      ...validFields(),
      verificationStatus: 'verified',
      verifiedAt: new Date('2026-01-01'),
      verifiedBy: HR_ID,
    };
    const r = applyCapabilityAction(current, 'submit', {
      fields: validFields({ yearsExperience: 4 }),
      jobTitle: JOB_TITLE,
      now: NOW,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capability.verificationStatus, 'pending_hr');
    assert.equal(r.capability.yearsExperience, 4);
    assert.equal(r.capability.verifiedAt, null);
    assert.equal(r.capability.verifiedBy, null);
    assert.ok(r.capability.submittedAt);
  });

  it('submit fails without jobTitle', () => {
    const r = applyCapabilityAction(emptyCapability(), 'submit', {
      fields: validFields(),
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CAPABILITY_SUBMIT_JOB_TITLE');
  });

  it('submit fails without minimum capability fields', () => {
    const r = applyCapabilityAction(emptyCapability(), 'submit', {
      fields: { primaryDomain: 'be' },
      jobTitle: JOB_TITLE,
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.match(r.errorCode, /^CAPABILITY_SUBMIT_/);
  });

  it('member cannot self-verify via action verify without pending', () => {
    const r = applyCapabilityAction(
      { ...emptyCapability(), ...validFields(), verificationStatus: 'draft' },
      'verify',
      { actorUserId: HR_ID, now: NOW }
    );
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'CAPABILITY_VERIFY_NOT_PENDING');
  });

  it('verify pending_hr → verified', () => {
    const current = {
      ...emptyCapability(),
      ...validFields(),
      verificationStatus: 'pending_hr',
    };
    const r = applyCapabilityAction(current, 'verify', {
      actorUserId: HR_ID,
      now: NOW,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capability.verificationStatus, 'verified');
    assert.equal(r.capability.verifiedBy, HR_ID);
    assert.ok(r.capability.verifiedAt);
  });

  it('reject requires reason; rejected → submit → pending_hr again', () => {
    const pending = {
      ...emptyCapability(),
      ...validFields(),
      verificationStatus: 'pending_hr',
    };
    const bad = applyCapabilityAction(pending, 'reject', { now: NOW });
    assert.equal(bad.ok, false);
    assert.equal(bad.errorCode, 'CAPABILITY_REJECT_REASON');

    const rejected = applyCapabilityAction(pending, 'reject', {
      rejectReason: 'Thiếu bằng chứng skill',
      now: NOW,
    });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.capability.verificationStatus, 'rejected');
    assert.equal(rejected.capability.rejectReason, 'Thiếu bằng chứng skill');

    const resubmit = applyCapabilityAction(rejected.capability, 'submit', {
      fields: validFields({ summary: 'Đã bổ sung' }),
      jobTitle: JOB_TITLE,
      now: NOW,
    });
    assert.equal(resubmit.ok, true);
    assert.equal(resubmit.capability.verificationStatus, 'pending_hr');
    assert.equal(resubmit.capability.rejectReason, '');
  });

  it('toPublicVerifiedCapability only when verified', () => {
    assert.equal(
      toPublicVerifiedCapability({
        ...validFields(),
        verificationStatus: 'pending_hr',
      }),
      null
    );
    const pub = toPublicVerifiedCapability({
      ...validFields(),
      positionCode: 'dev',
      verificationStatus: 'verified',
      verifiedAt: NOW,
    });
    assert.equal(pub.verificationStatus, 'verified');
    assert.equal(pub.primaryDomain, 'be');
    assert.ok(Array.isArray(pub.skills));
  });
});
