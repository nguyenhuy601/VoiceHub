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
  mergeClosedBoardExperience,
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
    assert.equal(r.fields.skills.length, 1);
    assert.equal(r.fields.skills[0].name, 'React');
    assert.equal(r.fields.skills[0].level, 5);
    assert.equal(r.fields.skills[0].rank, 1);
    assert.equal(r.fields.skills[0].proficiencyTier, 'expert');
  });

  it('sanitizes businessDomains and seniorityBand', () => {
    const r = sanitizeCapabilityFields({
      seniorityBand: 'senior',
      businessDomains: [{ name: 'Payment', rank: 1 }, { name: 'Banking' }],
      certifications: [{ name: 'AWS SA', issuer: 'Amazon' }],
    });
    assert.equal(r.ok, true);
    assert.equal(r.fields.seniorityBand, 'senior');
    assert.deepEqual(r.fields.businessDomains, [
      { name: 'Payment', rank: 1 },
      { name: 'Banking', rank: 2 },
    ]);
    assert.equal(r.fields.certifications.length, 1);
    assert.equal(r.fields.certifications[0].name, 'AWS SA');
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

  it('toPublicVerifiedCapability hides suggested project experiences', () => {
    const pub = toPublicVerifiedCapability({
      ...validFields(),
      verificationStatus: 'verified',
      verifiedAt: NOW,
      projectExperiences: [
        {
          name: 'Cổng thanh toán',
          role: 'BE',
          work: 'API',
          year: 2024,
          source: 'excel_import',
          status: 'verified',
        },
        {
          name: 'AI nháp',
          role: 'Lead',
          work: 'Gợi ý',
          source: 'closed_board',
          status: 'suggested',
        },
      ],
    });
    assert.equal(pub.projectExperiences.length, 1);
    assert.equal(pub.projectExperiences[0].name, 'Cổng thanh toán');
    assert.equal(pub.projectExperiences[0].status, 'verified');
  });

  it('confirm_experience verifies suggested closed_board; save_draft cannot spoof verified', () => {
    const boardId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const current = {
      ...emptyCapability(),
      ...validFields(),
      verificationStatus: 'verified',
      projectExperiences: [
        {
          name: 'VoiceHub',
          role: 'developer',
          work: 'VoiceHub · developer · 8/10 việc xong',
          year: 2026,
          source: 'closed_board',
          status: 'suggested',
          evidenceBoardId: boardId,
        },
      ],
    };
    const confirmed = applyCapabilityAction(current, 'confirm_experience', {
      evidenceBoardId: boardId,
      now: NOW,
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.capability.projectExperiences[0].status, 'verified');
    assert.equal(confirmed.capability.verificationStatus, 'verified');

    const spoof = applyCapabilityAction(confirmed.capability, 'save_draft', {
      fields: {
        ...validFields(),
        projectExperiences: [
          {
            name: 'VoiceHub',
            role: 'developer',
            work: 'hack',
            source: 'closed_board',
            status: 'verified',
            evidenceBoardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          },
        ],
      },
      now: NOW,
    });
    assert.equal(spoof.ok, true);
    assert.equal(spoof.capability.projectExperiences[0].status, 'suggested');
  });

  it('mergeClosedBoardExperience is idempotent and does not downgrade verified', () => {
    const boardId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const first = mergeClosedBoardExperience([], {
      name: 'VoiceHub',
      role: 'PM',
      work: 'VoiceHub · PM · hạn 2026-08-01',
      evidenceBoardId: boardId,
    });
    assert.equal(first.ok, true);
    assert.equal(first.list.length, 1);

    const second = mergeClosedBoardExperience(first.list, {
      name: 'VoiceHub',
      role: 'PM',
      work: 'VoiceHub · PM · 1/1 việc xong · hạn 2026-08-01',
      evidenceBoardId: boardId,
    });
    assert.equal(second.list.length, 1);
    assert.match(second.list[0].work, /1\/1/);

    const verified = [{ ...second.list[0], status: 'verified' }];
    const third = mergeClosedBoardExperience(verified, {
      name: 'VoiceHub',
      role: 'PM',
      work: 'should not replace',
      evidenceBoardId: boardId,
    });
    assert.equal(third.skippedVerified, true);
    assert.equal(third.list[0].work, verified[0].work);
    assert.equal(third.list[0].status, 'verified');
  });

  it('save_draft keeps excel_import source and projectExperiences', () => {
    const current = {
      ...emptyCapability(),
      ...validFields(),
      source: 'excel_import',
      verificationStatus: 'verified',
      projectExperiences: [
        {
          name: 'Cổng thanh toán',
          role: 'BE',
          work: 'API',
          year: 2024,
          source: 'excel_import',
          status: 'verified',
        },
      ],
    };
    const r = applyCapabilityAction(current, 'save_draft', {
      fields: validFields({ summary: 'Cập nhật mô tả' }),
      now: NOW,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capability.source, 'excel_import');
    assert.equal(r.capability.projectExperiences.length, 1);
    assert.equal(r.capability.projectExperiences[0].name, 'Cổng thanh toán');
    assert.equal(r.capability.projectExperiences[0].status, 'verified');
  });

  it('excel_import verified: save_draft cannot change domain/skills; submit is locked', () => {
    const current = {
      ...emptyCapability(),
      ...validFields(),
      source: 'excel_import',
      verificationStatus: 'verified',
      projectExperiences: [
        {
          name: 'Cổng thanh toán',
          role: 'BE',
          work: 'API đối soát Node.js/MongoDB',
          year: 2024,
          source: 'excel_import',
          status: 'verified',
        },
      ],
    };
    const r = applyCapabilityAction(current, 'save_draft', {
      fields: validFields({
        primaryDomain: 'qa',
        yearsExperience: 12,
        skills: [{ name: 'Selenium', level: 5 }],
        summary: 'NV sửa tóm tắt',
      }),
      now: NOW,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capability.primaryDomain, 'be');
    assert.equal(r.capability.yearsExperience, 3);
    assert.equal(r.capability.skills[0].name, 'Node.js');
    assert.equal(r.capability.summary, 'NV sửa tóm tắt');
    assert.equal(r.capability.projectExperiences[0].name, 'Cổng thanh toán');

    const sub = applyCapabilityAction(current, 'submit', {
      fields: validFields({ primaryDomain: 'qa' }),
      jobTitle: JOB_TITLE,
      now: NOW,
    });
    assert.equal(sub.ok, false);
    assert.equal(sub.errorCode, 'CAPABILITY_EXCEL_LOCKED');
  });
});
