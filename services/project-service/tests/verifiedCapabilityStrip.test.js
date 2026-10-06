const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  compactProjectExperiencesForPool,
  stripVerifiedCapabilityForPool,
} = require('../src/utils/staffing/verifiedCapabilityStrip');

describe('verifiedCapabilityStrip history source', () => {
  it('compact keeps source for verified PE from cv_parse and closed_board', () => {
    const rows = compactProjectExperiencesForPool([
      {
        name: 'A',
        role: 'dev',
        work: 'api',
        status: 'verified',
        source: 'closed_board',
      },
      {
        name: 'B',
        role: 'dev',
        work: 'ui',
        status: 'verified',
        source: 'cv_parse',
      },
      {
        name: 'C',
        role: 'dev',
        work: 'x',
        status: 'suggested',
        source: 'cv_parse',
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, 'closed_board');
    assert.equal(rows[1].source, 'cv_parse');
  });

  it('pool strip drops suggested experiences', () => {
    const cap = stripVerifiedCapabilityForPool(
      {
        verificationStatus: 'verified',
        primaryDomain: 'be',
        skills: [],
        businessDomains: [],
        projectExperiences: [
          { name: 'X', role: 'dev', work: 'w', status: 'suggested', source: 'cv_parse' },
        ],
      },
      { includeProjectExperiences: true }
    );
    assert.equal((cap.projectExperiences || []).length, 0);
  });
});
