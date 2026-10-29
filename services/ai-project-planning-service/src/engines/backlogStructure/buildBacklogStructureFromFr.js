/**
 * Propose candidates from FR rows → run pipeline → backlogStructure.
 * Does not use Story.id = FR.id.
 */

const { backlogProposeFromSources } = require('./backlogProposeFromSources');
const { runBacklogStructurePipeline } = require('./runBacklogStructurePipeline');
const { buildOperationKey, hashInput } = require('./proposalOperationStore');

async function buildBacklogStructureFromFr(opts = {}) {
  const frItems = Array.isArray(opts.frItems) ? opts.frItems : [];
  const epicsCatalog = Array.isArray(opts.epicsCatalog) ? opts.epicsCatalog : [];
  const frAllowList = frItems
    .map((r) => String(r.id || r.logicalId || r.frId || '').trim())
    .filter(Boolean);
  const acAllowList = [];
  for (const fr of frItems) {
    const frId = String(fr.id || fr.logicalId || '').trim();
    const ac = fr.ac || fr.acceptanceCriteria || '';
    const parts = Array.isArray(ac)
      ? ac
      : String(ac || '')
          .split(/\n|;/)
          .map((s) => s.trim())
          .filter(Boolean);
    parts.forEach((_, j) => acAllowList.push(`${frId}:AC-${j + 1}`));
  }

  const sourceSnapshotVersion =
    opts.sourceSnapshotVersion ||
    hashInput({ frAllowList, epicIds: epicsCatalog.map((e) => e.id) }).slice(0, 16);

  const operationKey =
    opts.operationKey ||
    buildOperationKey({
      packId: opts.packId || 'pack',
      phase: 'what',
      tool: 'backlogPropose',
      sourceSnapshotVersion,
      purpose: 'backlog_structure',
    });

  const proposed = await backlogProposeFromSources({
    frRows: frItems,
    evidenceAllowList: opts.evidenceAllowList,
    generateJsonFn: opts.generateJsonFn,
    env: opts.env,
    epicTitle: epicsCatalog[0]?.name || epicsCatalog[0]?.title,
  });

  const pipeline = runBacklogStructurePipeline({
    candidateProposal: proposed.candidateProposal,
    llmCoverageProposals: proposed.llmCoverageProposals,
    operationKey,
    inputFingerprint: {
      frAllowList: [...frAllowList].sort(),
      acAllowList: [...acAllowList].sort(),
      sourceSnapshotVersion,
      purpose: 'backlog_structure',
    },
    frAllowList,
    acAllowList,
    frInScope: frAllowList,
    acInScope: acAllowList,
    approvedBaseline: opts.approvedBaseline || null,
    currentDraft: opts.currentDraft || null,
    userEdits: opts.userEdits || null,
    identityResolutions: opts.identityResolutions || [],
    expectedDraftRevisionId: opts.expectedDraftRevisionId ?? null,
    currentDraftRevisionId: opts.currentDraftRevisionId ?? null,
    sourceSnapshotVersion,
  });

  if (!pipeline.ok) {
    return {
      ok: false,
      ...pipeline,
      backlogSource: 'backlog_structure',
    };
  }

  const structure = pipeline.backlogStructure;
  if (epicsCatalog.length && structure.epics?.length === 1) {
    const cat = epicsCatalog[0];
    if (cat?.id && structure.epics[0]) {
      const oldId = structure.epics[0].id;
      structure.epics[0].id = cat.id;
      structure.epics[0].name = cat.name || cat.title || structure.epics[0].title;
      for (const f of structure.features || []) {
        if (f.parentEpicId === oldId) f.parentEpicId = cat.id;
      }
      for (const s of structure.stories || []) {
        if (s.parentEpicId === oldId) s.parentEpicId = cat.id;
      }
      if (pipeline.tempRefMap) {
        for (const [k, v] of Object.entries(pipeline.tempRefMap)) {
          if (v === oldId) pipeline.tempRefMap[k] = cat.id;
        }
      }
    }
  }

  return {
    ok: true,
    backlogStructure: {
      ...structure,
      meta: {
        ...structure.meta,
        backlogSource: 'backlog_structure',
        proposeSource: proposed.source,
      },
    },
    tempRefMap: pipeline.tempRefMap,
    draftRevisionId: pipeline.draftRevisionId,
    replay: pipeline.replay,
  };
}

module.exports = {
  buildBacklogStructureFromFr,
};
