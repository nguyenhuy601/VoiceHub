const { TEMPLATE_VERSION } = require('../../constants/requirementTemplate.constants');
const { parseDateValue } = require('./requirementDateUtils');
const { buildStaffingPlanFromParsed } = require('./requirementStaffingRollup');
const { resolveWhitelistSkill } = require('./requirementStaffingParse');
const { createEmptyAiAnalysisContainer } = require('../aiAnalysis/aiAnalysisContainer');
const { clampOverviewForPack } = require('./requirementOverviewClamp');

function splitPlatforms(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapFunctionalRow(row) {
  return {
    externalId: row.externalId,
    level: row.level,
    parentExternalId: row.parentExternalId || '',
    name: row.name,
    description: row.description || '',
    actor: row.actor || '',
    priority: row.priority || 'Medium',
    acceptanceCriteria: row.acceptanceCriteria || '',
    sortOrder: row.sortOrder ?? 0,
    suggestedSkills: (row.suggestedSkills || []).map((s) => resolveWhitelistSkill(s)).filter(Boolean),
    estimateHours: row.estimateHours ?? null,
    suggestedRoleKey: row.suggestedRoleKey || '',
    moduleLabel: row.moduleLabel || '',
    capabilityLabel: row.capabilityLabel || '',
    featureLabel: row.featureLabel || '',
    trigger: row.trigger || '',
    preconditions: row.preconditions || '',
    mainFlow: row.mainFlow || '',
    exceptionFlow: row.exceptionFlow || '',
    businessRules: row.businessRules || '',
    input: row.input || '',
    output: row.output || '',
    customerRequirementIds: Array.isArray(row.customerRequirementIds)
      ? row.customerRequirementIds
      : [],
    brIds: Array.isArray(row.brIds) ? row.brIds : [],
    bpmIds: Array.isArray(row.bpmIds) ? row.bpmIds : [],
    frDependencies: row.frDependencies || '',
    assumption: row.assumption || '',
    constraintsNotes: row.constraintsNotes || '',
    status: row.status || '',
    baNote: row.baNote || '',
  };
}

/**
 * Map parsed workbook (SRS or Analysis) → RequirementPack create payload.
 * Keeps Analysis extras (Scope CR/source, Assumptions text, IF/DATA/glossary) for artifact seed.
 */
function mapParsedToPackPayload(parsed, skillExtras = {}) {
  const overview = parsed.overview || {};
  const functionalRequirements = (parsed.functionalRequirements || []).map(mapFunctionalRow);
  const staffingPlan = buildStaffingPlanFromParsed(
    {
      ...parsed,
      functionalRequirements,
    },
    { resolvedStaffingSkills: skillExtras.staffingSkillsResolved }
  );

  return {
    templateVersion: parsed.templateVersion || TEMPLATE_VERSION,
    overview: clampOverviewForPack({
      requirementName: overview.requirementName || '',
      projectObjective: overview.projectObjective || '',
      businessScope: overview.businessScope || '',
      platform: splitPlatforms(overview.platform),
      expectedUsers: overview.expectedUsers || '',
      expectedScale: overview.expectedScale || '',
      deadline: parseDateValue(overview.deadline),
      startDate: parseDateValue(overview.startDate),
      budget: overview.budget ? Number(String(overview.budget).replace(/[^\d.-]/g, '')) || null : null,
      budgetCurrency: String(overview.budgetCurrency || staffingPlan.budgetCurrency || '')
        .trim()
        .toUpperCase(),
      priority: overview.priority || 'Medium',
    }),
    staffingPlan,
    aiPlanning: {
      status: 'none',
      overlay: null,
      generatedAt: null,
      sourcePackVersion: null,
    },
    aiAnalysis: createEmptyAiAnalysisContainer(),
    scope: (parsed.scope || []).map((row) => ({
      type: row.type,
      description: row.description,
      source: row.source || '',
      dateRaised: row.dateRaised || '',
      status: row.status || '',
      baNote: row.baNote || '',
      customerRequirementIds: Array.isArray(row.customerRequirementIds)
        ? row.customerRequirementIds
        : [],
    })),
    functionalRequirements,
    nonFunctionalRequirements: (parsed.nonFunctionalRequirements || []).map((row) => ({
      externalId: row.externalId,
      category: row.category,
      requirement: row.requirement,
      target: row.target,
      priority: row.priority || 'Medium',
      measurement: row.measurement || '',
      scope: row.scope || '',
      constraint: row.constraint || '',
      acceptanceCriteria: row.acceptanceCriteria || row.verification || '',
      source: row.source || '',
      status: row.status || '',
      baNote: row.baNote || '',
      customerRequirementIds: Array.isArray(row.customerRequirementIds)
        ? row.customerRequirementIds
        : [],
      verification: row.verification || row.acceptanceCriteria || '',
    })),
    technology: (parsed.technology || []).map((row) => ({
      category: row.category,
      name: row.name,
      version: row.version,
      mandatory: Boolean(row.mandatory),
      note: row.note || '',
    })),
    integration: (parsed.integration || []).map((row) => ({
      system: row.system,
      integrationType: row.integrationType,
      direction: row.direction,
      description: row.description,
      required: row.required !== false,
    })),
    constraints: (parsed.constraints || []).map((row) => ({
      type: row.type,
      description: row.description,
    })),
    dependencies: (parsed.dependencies || []).map((row) => ({
      externalId: row.externalId,
      dependency: row.dependency,
      type: row.type,
      requiredDate: parseDateValue(row.requiredDateRaw),
      impact: row.impact,
    })),
    assumptions: (parsed.assumptions || []).map((row) => {
      const text = row.text || row.assumption || '';
      return {
        externalId: row.externalId,
        assumption: row.assumption || text,
        text,
        impactIfInvalid: row.impactIfInvalid || '',
        relatedArtifactIds: Array.isArray(row.relatedArtifactIds) ? row.relatedArtifactIds : [],
        customerRequirementIds: Array.isArray(row.customerRequirementIds)
          ? row.customerRequirementIds
          : [],
        status: row.status || '',
        baNote: row.baNote || '',
      };
    }),
    interfaces: Array.isArray(parsed.interfaces) ? parsed.interfaces : [],
    dataEntities: Array.isArray(parsed.dataEntities) ? parsed.dataEntities : [],
    glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
    businessGoals: (parsed.businessGoals || []).map((row) => ({
      externalId: row.externalId,
      title: row.title,
      statement: row.statement,
      successMetric: row.successMetric,
      priority: row.priority || 'Medium',
      businessProblem: row.businessProblem || '',
      expectedBusinessOutcome: row.expectedBusinessOutcome || '',
      stakeholder: row.stakeholder || '',
      assumption: row.assumption || '',
      constraint: row.constraint || '',
      status: row.status || '',
      baNote: row.baNote || '',
      customerRequirementIds: Array.isArray(row.customerRequirementIds)
        ? row.customerRequirementIds
        : [],
    })),
    businessRules: (parsed.businessRules || []).map((row) => ({
      externalId: row.externalId,
      title: row.title,
      description: row.description,
      whenApplies: row.whenApplies,
      exception: row.exception,
      relatedBg: row.relatedBg,
      businessRule: row.businessRule || '',
      stakeholder: row.stakeholder || '',
      priority: row.priority || 'Medium',
      successCriteria: row.successCriteria || '',
      dependency: row.dependency || '',
      assumption: row.assumption || '',
      constraint: row.constraint || '',
      status: row.status || '',
      baNote: row.baNote || '',
      customerRequirementIds: Array.isArray(row.customerRequirementIds)
        ? row.customerRequirementIds
        : [],
    })),
    businessProcesses: (parsed.businessProcesses || []).map((row) => ({
      externalId: row.externalId,
      processName: row.processName,
      step: row.step,
      actor: row.actor,
      action: row.action,
      input: row.input,
      output: row.output,
      relatedSystems: row.relatedSystems,
      relatedBr: row.relatedBr || '',
      processDescription: row.processDescription || '',
      trigger: row.trigger || '',
      precondition: row.precondition || '',
      businessRule: row.businessRule || '',
      exception: row.exception || '',
      relatedCr: row.relatedCr || '',
      status: row.status || '',
      baNote: row.baNote || '',
    })),
    useCases: (parsed.useCases || []).map((row) => ({
      externalId: row.externalId,
      title: row.title,
      actor: row.actor,
      precondition: row.precondition,
      mainFlow: row.mainFlow,
      relatedFr: row.relatedFr,
      relatedFrIds: Array.isArray(row.relatedFrIds) ? row.relatedFrIds : [],
      brIds: Array.isArray(row.brIds) ? row.brIds : [],
      customerRequirementIds: Array.isArray(row.customerRequirementIds)
        ? row.customerRequirementIds
        : [],
      goal: row.goal || '',
      secondaryActor: row.secondaryActor || '',
      trigger: row.trigger || '',
      postconditions: row.postconditions || '',
      alternativeFlow: row.alternativeFlow || '',
      exceptionFlow: row.exceptionFlow || '',
      businessRules: row.businessRules || '',
      input: row.input || '',
      output: row.output || '',
      priority: row.priority || 'Medium',
      status: row.status || '',
      baNote: row.baNote || '',
    })),
    traceabilityLinks: Array.isArray(parsed.traceabilityLinks) ? parsed.traceabilityLinks : [],
    requirementSkills: skillExtras.requirementSkillRefs || [],
    importSkillMeta: {
      newSkillsDetected: [],
      resolvedAt: null,
    },
    isRequirementAnalysis: Boolean(parsed.isRequirementAnalysis),
  };
}

module.exports = {
  mapParsedToPackPayload,
  mapFunctionalRow,
};
