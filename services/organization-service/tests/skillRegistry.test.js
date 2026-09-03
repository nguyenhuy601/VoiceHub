const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSkillInput } = require('../src/utils/skillNormalize');

describe('skillNormalize', () => {
  it('maps postgres alias to PostgreSQL canonical', () => {
    const r = normalizeSkillInput('Postgres');
    assert.equal(r.suggestedCanonical, 'PostgreSQL');
    assert.equal(r.matchedAlias, true);
  });

  it('title-cases unknown skill', () => {
    const r = normalizeSkillInput('fastapi');
    assert.equal(r.suggestedCanonical, 'Fastapi');
  });
});

const mongoUri = String(process.env.MONGODB_URI || '').trim();
const mongoDescribe = mongoUri ? describe : describe.skip;

mongoDescribe('skillRegistry.service (integration)', () => {
  const { mongoose } = require('@enterprise/shared/config/mongo');
  const SkillRegistry = require('../src/models/SkillRegistry');
  const {
    resolveOrCreate,
    resolveBatch,
    reviewSkill,
    ensureOrgSeeded,
  } = require('../src/services/skillRegistry.service');

  const TEST_ORG_ID = new mongoose.Types.ObjectId();

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
    await SkillRegistry.deleteMany({ organizationId: TEST_ORG_ID });
  });

  after(async () => {
    await SkillRegistry.deleteMany({ organizationId: TEST_ORG_ID });
  });

  it('seeds ACTIVE skills for org', async () => {
    const r = await ensureOrgSeeded(TEST_ORG_ID);
    assert.ok(r.seeded > 0 || r.skipped);
    const count = await SkillRegistry.countDocuments({ organizationId: TEST_ORG_ID, status: 'ACTIVE' });
    assert.ok(count >= 30);
  });

  it('resolveOrCreate returns ACTIVE for SQL', async () => {
    const r = await resolveOrCreate(TEST_ORG_ID, 'SQL');
    assert.equal(r.status, 'ACTIVE');
    assert.ok(r.skillId);
    assert.equal(r.isNew, false);
  });

  it('resolveOrCreate creates PENDING for FastAPI', async () => {
    const r = await resolveOrCreate(TEST_ORG_ID, 'FastAPI');
    assert.equal(r.status, 'PENDING');
    assert.equal(r.isNew, true);
    assert.ok(r.skillId);
  });

  it('resolveBatch collects newSkills', async () => {
    const batch = await resolveBatch(TEST_ORG_ID, ['SQL', 'Redis', 'Kafka']);
    assert.ok(batch.results.length >= 3);
    const kafka = batch.results.find((x) => /kafka/i.test(x.input));
    assert.ok(kafka);
    assert.equal(kafka.status, 'PENDING');
    assert.ok(batch.newSkills.some((s) => /kafka/i.test(s.input)));
  });

  it('reviewSkill accept activates PENDING', async () => {
    const pending = await resolveOrCreate(TEST_ORG_ID, 'Nest FastAPI Test Skill');
    assert.equal(pending.status, 'PENDING');
    const reviewed = await reviewSkill(TEST_ORG_ID, pending.skillId, 'accept', {}, null);
    assert.equal(reviewed.status, 'ACTIVE');
  });
});
