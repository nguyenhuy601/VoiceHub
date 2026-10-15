/**
 * Semantic derive context — full FR once + locale; no duplicate G4 / alias dumps in prompt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSemanticDeriveContext,
  normalizeDeriveLocale,
  languageInstruction,
  takeFrFull,
  toDerivePromptPayload,
} = require('../src/semantic/buildSemanticDeriveContext');
const { buildDeriveInputForSection } = require('../src/semantic/buildSectionDeriveInputs');

describe('semantic derive context', () => {
  it('keeps FR description/AC (not aggressive slim)', () => {
    const longDesc = 'A'.repeat(500);
    const ac = 'Given X when Y then Z — acceptance detail';
    const rows = takeFrFull(
      {
        functionalRequirements: [
          {
            id: 'FR-1',
            name: 'Login',
            description: longDesc,
            acceptanceCriteria: ac,
            actor: 'User',
          },
        ],
      },
      {},
      10
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].description.length >= 400);
    assert.match(rows[0].acceptanceCriteria, /acceptance detail/);
  });

  it('merges G4 capability/intent onto FR (no requirements dump)', () => {
    const rows = takeFrFull(
      { functionalRequirements: [{ id: 'FR-1', name: 'Login', description: 'Sign in' }] },
      {
        g4Understanding: {
          requirements: [
            {
              id: 'FR-1',
              semanticInterpretation: { capability: 'auth.login', intent: 'authenticate' },
            },
          ],
          semanticItems: [{ frId: 'FR-1', semanticInterpretation: { capability: 'auth.login' } }],
        },
      },
      10
    );
    assert.equal(rows[0].capability, 'auth.login');
    assert.equal(rows[0].intent, 'authenticate');
    const ctx = buildSemanticDeriveContext(
      { functionalRequirements: [{ id: 'FR-1', name: 'Login', description: 'Sign in' }] },
      {
        g4Understanding: {
          requirements: [
            {
              id: 'FR-1',
              ambiguities: [{ field: 'actor', issue: 'unclear' }],
            },
          ],
        },
      }
    );
    assert.equal(ctx.requirementUnderstanding?.requirements, undefined);
    assert.equal(ctx.requirementUnderstanding?.semanticItems, undefined);
    assert.ok(ctx.requirementUnderstanding?.ambiguities?.length >= 1);
  });

  it('normalizes locale and language instruction', () => {
    assert.equal(normalizeDeriveLocale('EN'), 'en');
    assert.equal(normalizeDeriveLocale('vi-VN'), 'vi');
    assert.match(languageInstruction('en'), /English/i);
    assert.match(languageInstruction('vi'), /tiếng Việt/i);
  });

  it('section input includes semantic + locale; prompt omits frSlim alias', () => {
    const pack = {
      overview: { projectObjective: 'Obj', expectedUsers: 'BA, PM' },
      functionalRequirements: [
        { id: 'FR-1', name: 'Create task', description: 'User creates task', actor: 'Employee' },
      ],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        customerRawRows: { businessRequests: [{ id: 'BRQ-1', statement: 'Need tasks' }] },
      },
    };
    const g4 = {
      requirements: [
        {
          id: 'FR-1',
          title: 'Create task',
          actors: ['Employee'],
          semanticInterpretation: { capability: 'task.create', intent: 'create' },
          ambiguities: [{ field: 'priority', issue: 'missing' }],
        },
      ],
      evidence: [{ frId: 'FR-1', metric: 'semantic_projection', value: 'task.create' }],
    };
    const input = buildDeriveInputForSection('br', pack, { locale: 'vi', g4Understanding: g4 });
    assert.equal(input.locale, 'vi');
    assert.match(input.languageInstruction || '', /tiếng Việt/i);
    assert.ok(Array.isArray(input.frFull) && input.frFull.length >= 1);
    assert.equal(input.frFull[0].capability, 'task.create');
    assert.ok(input.frSlim === input.frFull);
    assert.ok(Array.isArray(input.evidenceRefs));

    const payload = toDerivePromptPayload(input);
    assert.ok(payload.frFull);
    assert.equal(payload.frSlim, undefined);
    assert.equal(payload.brqSlim, undefined);
    assert.equal(payload.languageInstruction, undefined);
    assert.equal(payload.deriveInstruction, undefined);
    assert.equal(payload.requirementUnderstanding?.requirements, undefined);
    assert.equal(payload.requirementUnderstanding?.semanticItems, undefined);

    const withDup = JSON.stringify(input).length;
    const compact = JSON.stringify(payload).length;
    assert.ok(compact < withDup, `expected compact ${compact} < raw ${withDup}`);
    assert.ok(compact < withDup * 0.75, 'prompt payload should drop alias + meta dumps');
  });

  it('BG does not attach frFull (keeps slim V2)', () => {
    const input = buildDeriveInputForSection(
      'bg',
      {
        overview: { projectObjective: 'O' },
        functionalRequirements: [
          { id: 'FR-1', name: 'A', description: 'x'.repeat(400), acceptanceCriteria: 'y'.repeat(200) },
        ],
      },
      { locale: 'vi' }
    );
    assert.equal(input.frFull, undefined);
    assert.ok(Array.isArray(input.requirements));
  });

  it('actors builder exists with semantic context', () => {
    const ctx = buildSemanticDeriveContext(
      { functionalRequirements: [{ id: 'FR-1', name: 'X', actor: 'Admin' }] },
      { locale: 'en' }
    );
    assert.equal(ctx.locale, 'en');
    const input = buildDeriveInputForSection(
      'actors',
      { functionalRequirements: [{ id: 'FR-1', name: 'X', actor: 'Admin' }], overview: {} },
      { locale: 'en' }
    );
    assert.equal(input.engineId, 'actors');
    assert.match(input.languageInstruction || '', /English/i);
  });
});
