/**
 * Propose Epic/Feature/Story candidates from FR/AC sources (tempIds).
 * Default: deterministic heuristic for tests / flag-off dual path.
 * Optional generateJsonFn for LLM JSON propose (same schema).
 */

const { CLASSIFICATION_TYPES } = require('./constants');

function buildHeuristicCandidates(opts = {}) {
  const frRows = Array.isArray(opts.frRows) ? opts.frRows : [];
  const epics = [];
  const features = [];
  const stories = [];

  // Group by module/capability label when present; else one epic for all.
  const byCapability = new Map();
  frRows.forEach((fr, i) => {
    const frId = String(fr.id || fr.logicalId || fr.frId || '').trim();
    if (!frId) return;
    const cap = String(fr.feature || fr.module || fr.capability || 'general').trim() || 'general';
    if (!byCapability.has(cap)) byCapability.set(cap, []);
    byCapability.get(cap).push({ fr, frId, index: i });
  });

  const epicTemp = 'tmp-epic-root';
  epics.push({
    tempId: epicTemp,
    title: opts.epicTitle || 'Product outcome',
    sourceFrIds: frRows.map((f) => String(f.id || f.logicalId || '').trim()).filter(Boolean),
    classificationDecision: {
      type: CLASSIFICATION_TYPES.EPIC,
      summary: 'Shared business outcome across capabilities in this proposal',
      capabilities: [...byCapability.keys()],
      evidenceRefs: opts.evidenceAllowList?.slice?.(0, 2) || ['EV-ROOT'],
    },
  });

  let fi = 0;
  for (const [cap, rows] of byCapability.entries()) {
    fi += 1;
    const featureTemp = `tmp-feature-${fi}`;
    // Only create Feature when ≥2 stories in same capability (R-NO-WRAP)
    const makeFeature = rows.length >= 2;
    if (makeFeature) {
      features.push({
        tempId: featureTemp,
        title: `Capability: ${cap}`,
        parentEpicTempId: epicTemp,
        sourceFrIds: rows.map((r) => r.frId),
        classificationDecision: {
          type: CLASSIFICATION_TYPES.FEATURE,
          summary: `One capability boundary: ${cap}`,
          valueSlices: rows.map((r) => r.fr.name || r.fr.title || r.frId),
          evidenceRefs: opts.evidenceAllowList?.slice?.(0, 2) || [`EV-F-${fi}`],
        },
      });
    }

    rows.forEach((row, si) => {
      const fr = row.fr;
      const title = String(fr.name || fr.title || row.frId).trim();
      const ac = fr.ac || fr.acceptanceCriteria || '';
      const acRefs = Array.isArray(ac)
        ? ac.map((x, j) => `${row.frId}:AC-${j + 1}`)
        : String(ac || '')
            .split(/\n|;/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((_, j) => `${row.frId}:AC-${j + 1}`);
      stories.push({
        tempId: `tmp-story-${fi}-${si + 1}`,
        title,
        parentFeatureTempId: makeFeature ? featureTemp : null,
        parentEpicTempId: makeFeature ? null : epicTemp,
        sourceFrIds: [row.frId],
        acRefs,
        classificationDecision: {
          type: CLASSIFICATION_TYPES.STORY,
          summary: `Verifiable slice for ${title}`,
          beneficiary: Array.isArray(fr.actors) ? fr.actors[0] : fr.actor || 'user',
          behavior: title,
          evidenceRefs: opts.evidenceAllowList?.slice?.(0, 1) || [`EV-${row.frId}`],
        },
      });
    });
  }

  // Optional: many FR → 1 story when opts.mergeFrIds provided
  if (Array.isArray(opts.mergeFrIds) && opts.mergeFrIds.length >= 2) {
    const ids = opts.mergeFrIds.map(String);
    stories.push({
      tempId: 'tmp-story-merged',
      title: opts.mergeTitle || 'Combined value slice',
      parentFeatureTempId: null,
      parentEpicTempId: epicTemp,
      sourceFrIds: ids,
      acRefs: ids.map((id) => `${id}:AC-1`),
      classificationDecision: {
        type: CLASSIFICATION_TYPES.STORY,
        summary: 'One story spanning multiple FRs with shared outcome',
        beneficiary: 'user',
        behavior: opts.mergeTitle || 'combined',
        evidenceRefs: ['EV-MERGE'],
      },
    });
  }

  // Optional independent story (no parent)
  if (opts.independentStory && frRows[0]) {
    const frId = String(frRows[0].id || frRows[0].logicalId).trim();
    stories.push({
      tempId: 'tmp-story-independent',
      title: opts.independentStory.title || 'Independent story',
      parentFeatureTempId: null,
      parentEpicTempId: null,
      sourceFrIds: [frId],
      acRefs: [`${frId}:AC-1`],
      classificationDecision: {
        type: CLASSIFICATION_TYPES.STORY,
        summary: 'Standalone verifiable slice',
        beneficiary: 'user',
        behavior: opts.independentStory.title || 'independent',
        evidenceRefs: ['EV-IND'],
      },
    });
  }

  // 1 FR → many stories
  if (opts.splitFrId) {
    const frId = String(opts.splitFrId).trim();
    stories.push({
      tempId: 'tmp-story-split-a',
      title: `Split A of ${frId}`,
      parentEpicTempId: epicTemp,
      sourceFrIds: [frId],
      acRefs: [`${frId}:AC-1`],
      classificationDecision: {
        type: CLASSIFICATION_TYPES.STORY,
        summary: 'First value slice of shared FR',
        beneficiary: 'user',
        behavior: 'split-a',
        evidenceRefs: ['EV-SPLIT-A'],
      },
    });
    stories.push({
      tempId: 'tmp-story-split-b',
      title: `Split B of ${frId}`,
      parentEpicTempId: epicTemp,
      sourceFrIds: [frId],
      acRefs: [`${frId}:AC-2`],
      classificationDecision: {
        type: CLASSIFICATION_TYPES.STORY,
        summary: 'Second value slice of shared FR',
        beneficiary: 'user',
        behavior: 'split-b',
        evidenceRefs: ['EV-SPLIT-B'],
      },
    });
  }

  const llmCoverageProposals = {
    coverageByFrId: {},
    coverageByAcRef: {},
  };
  for (const fr of frRows) {
    const frId = String(fr.id || fr.logicalId || '').trim();
    if (!frId) continue;
    llmCoverageProposals.coverageByFrId[frId] = {
      status: 'PARTIALLY_COVERED',
      evidenceRefs: [`EV-${frId}`],
      summary: 'Heuristic semantic coverage proposal',
    };
  }

  return {
    epics,
    features,
    stories,
    llmCoverageProposals,
  };
}

async function backlogProposeFromSources(opts = {}) {
  if (typeof opts.generateJsonFn === 'function') {
    // LLM path reserved — fall back to heuristic if shape invalid
    try {
      const prompt = [
        'Propose backlog JSON only: epics[], features[], stories[] with tempId, title, sourceFrIds, acRefs, classificationDecision, parent*TempId.',
        'Do not invent FR ids. Do not use FR id as story id. Feature only for capability boundaries.',
        `FR_LIST=${JSON.stringify(opts.frRows || [])}`,
      ].join('\n');
      const out = await opts.generateJsonFn({ prompt, env: opts.env });
      if (out?.ok && out.data && Array.isArray(out.data.stories)) {
        return {
          candidateProposal: out.data,
          llmCoverageProposals: out.data.llmCoverageProposals || {},
          source: 'llm',
        };
      }
    } catch {
      /* heuristic */
    }
  }
  const built = buildHeuristicCandidates(opts);
  return {
    candidateProposal: {
      epics: built.epics,
      features: built.features,
      stories: built.stories,
    },
    llmCoverageProposals: built.llmCoverageProposals,
    source: 'heuristic',
  };
}

module.exports = {
  buildHeuristicCandidates,
  backlogProposeFromSources,
};
