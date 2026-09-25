/**
 * G1 Knowledge & Shared Resources — Build Contract schemas (Wave D prep).
 * SoT narrative: .cursor/plans/ai-project-g1-g7-build-contracts.md
 * RULE-07: catalogs are read-only for LLM; no write path from Agent/RAG.
 */

const G1_CONTRACT_VERSION = 'g1.catalog.v1';

/** Allowed skill level scale (normalize in G3). */
const SKILL_LEVEL_MIN = 1;
const SKILL_LEVEL_MAX = 5;

/**
 * Skill catalog entry (versioned SoT — replaces buildSkillCatalogStub string list).
 * @typedef {{ skillId: string, name: string, aliases?: string[], category?: string, levelScale?: { min: number, max: number } }} SkillCatalogEntry
 */

/**
 * Metric catalog entry — every tool numeric claim must resolve here (RULE-10 / G1 AC).
 * @typedef {{
 *   metricId: string,
 *   formula: string,
 *   unit: string,
 *   description?: string,
 *   owners: string[],
 *   ruleId?: string
 * }} MetricCatalogEntry
 */

/**
 * Dimension / enum map for G3 normalize (Position, Skill synonym, …).
 * @typedef {{ dimensionId: string, values: string[], aliases?: Record<string, string> }} DimensionCatalogEntry
 */

/**
 * Vector-ready document (index target for G7; corpus scoped by snapshotId — RULE-09).
 * @typedef {{
 *   sourceId: string,
 *   docType: 'evidence_span'|'srs_canonical'|'skill_def'|'metric_def'|'employee_history'|'calendar_rule',
 *   text: string,
 *   metadata: {
 *     snapshotId: string,
 *     projectId?: string,
 *     packId?: string,
 *     packVersion?: number,
 *     skillId?: string,
 *     metricId?: string,
 *     orgId?: string
 *   },
 *   embeddingVersion?: string
 * }} VectorDocument
 */

/** Seed metric defs used by Wave A evidence / tools — must stay in sync with tool claims. */
const METRIC_CATALOG_SEED = Object.freeze([
  Object.freeze({
    metricId: 'available_capacity',
    formula: 'available_hours - committed_hours',
    unit: 'hours',
    description: 'Employee remaining capacity in planning window',
    owners: ['EmployeeMatchingTool', 'ScheduleTool'],
    ruleId: 'CAP-003',
  }),
  Object.freeze({
    metricId: 'planned_allocation',
    formula: 'sum(assignment.plannedHours)',
    unit: 'hours',
    description: 'Aggregate planned allocation on resource',
    owners: ['resourceCapacity', 'EmployeeMatchingTool'],
    ruleId: 'CAP-001',
  }),
  Object.freeze({
    metricId: 'candidate_count',
    formula: 'count(matching.candidates)',
    unit: 'count',
    description: 'Number of matching candidates returned',
    owners: ['EmployeeMatchingTool'],
    ruleId: 'MATCH-001',
  }),
  Object.freeze({
    metricId: 'total_effort_hours',
    formula: 'sum(wbs.estimateHours)',
    unit: 'hours',
    description: 'Total estimated effort from WBS',
    owners: ['EffortEstimationTool', 'EffortTool'],
    ruleId: 'EFF-001',
  }),
  Object.freeze({
    metricId: 'scheduled_tasks',
    formula: 'count(schedule.tasks)',
    unit: 'count',
    description: 'Tasks placed on calendar by ScheduleTool',
    owners: ['ScheduleTool'],
    ruleId: 'SCH-001',
  }),
  Object.freeze({
    metricId: 'feasibility_pass',
    formula: 'G13.pass ? 1 : 0',
    unit: 'boolean',
    description: 'Whole-plan feasibility gate result',
    owners: ['FeasibilityValidator'],
    ruleId: 'FEAS-001',
  }),
  Object.freeze({
    metricId: 'component_count',
    formula: 'count(architecture.components)',
    unit: 'count',
    description: 'Architecture component count',
    owners: ['ArchitectureTool'],
    ruleId: 'ARCH-001',
  }),
  Object.freeze({
    metricId: 'risk_count',
    formula: 'count(risks)',
    unit: 'count',
    description: 'Identified risk count',
    owners: ['RiskTool'],
    ruleId: 'RISK-001',
  }),
  Object.freeze({
    metricId: 'total_story_points',
    formula: 'sum(wbs.storyPoints)',
    unit: 'points',
    description: 'Total story points from WBS',
    owners: ['EffortEstimationTool', 'EffortTool'],
    ruleId: 'EFF-002',
  }),
  Object.freeze({
    metricId: 'project_duration_hours',
    formula: 'cpm_project_duration',
    unit: 'hours',
    description: 'CPM theoretical project duration',
    owners: ['SequencingTool'],
    ruleId: 'CPM-001',
  }),
  Object.freeze({
    metricId: 'hierarchy_node_count',
    formula: 'count(hierarchy.nodes)',
    unit: 'count',
    description: 'Hierarchy decomposition node count',
    owners: ['HierarchyTool'],
    ruleId: 'HIER-001',
  }),
  Object.freeze({
    metricId: 'capability_item_count',
    formula: 'count(capability.items)',
    unit: 'count',
    description: 'Capability analysis item count',
    owners: ['CapabilityTool'],
    ruleId: 'CAPA-001',
  }),
  Object.freeze({
    metricId: 'insight_count',
    formula: 'count(insights)',
    unit: 'count',
    description: 'Requirement insight count',
    owners: ['InsightsTool'],
    ruleId: 'INS-001',
  }),
  Object.freeze({
    metricId: 'wbs_task_count',
    formula: 'count(wbs.tasks)',
    unit: 'count',
    description: 'WBS task count',
    owners: ['WbsTool'],
    ruleId: 'WBS-001',
  }),
  Object.freeze({
    metricId: 'dependency_edge_count',
    formula: 'count(dependency.edges)',
    unit: 'count',
    description: 'Dependency edge count',
    owners: ['DependencyTool'],
    ruleId: 'DEP-001',
  }),
  Object.freeze({
    metricId: 'plan_work_count',
    formula: 'count(executionPlan.tasks)',
    unit: 'count',
    description: 'Project plan work item count',
    owners: ['ProjectPlanTool'],
    ruleId: 'PLAN-001',
  }),
  Object.freeze({
    metricId: 'fr_count',
    formula: 'count(functionalRequirements)',
    unit: 'count',
    description: 'Functional requirement count',
    owners: ['RequirementAnalysisTool'],
    ruleId: 'REQ-001',
  }),
  Object.freeze({
    metricId: 'completeness.score',
    formula: 'requirement_completeness_score',
    unit: 'ratio',
    description: 'Requirement completeness score',
    owners: ['RequirementAnalysisTool'],
    ruleId: 'REQ-002',
  }),
  Object.freeze({
    metricId: 'coverage.score',
    formula: 'requirement_coverage_score',
    unit: 'ratio',
    description: 'Requirement coverage score',
    owners: ['RequirementAnalysisTool'],
    ruleId: 'REQ-003',
  }),
  Object.freeze({
    metricId: 'hierarchy_parent',
    formula: 'parent_child_link',
    unit: 'ref',
    description: 'FR hierarchy parent reference',
    owners: ['RequirementAnalysisTool'],
    ruleId: 'REQ-004',
  }),
  Object.freeze({
    metricId: 'dependency',
    formula: 'requirement_dependency_edge',
    unit: 'ref',
    description: 'Requirement dependency edge',
    owners: ['RequirementAnalysisTool'],
    ruleId: 'REQ-005',
  }),
  Object.freeze({
    metricId: 'relationship_candidate',
    formula: 'llm_relationship_candidate',
    unit: 'ref',
    description: 'G4 LLM relationship candidate',
    owners: ['G17:requirementUnderstanding'],
    ruleId: 'G4-LLM-REL-001',
  }),
  Object.freeze({
    metricId: 'job_status',
    formula: 'planning_job_status',
    unit: 'enum',
    description: 'Planning job completion status',
    owners: ['jobRegistry'],
    ruleId: 'JOB-001',
  }),
]);

const VECTOR_DOC_TYPES = Object.freeze([
  'evidence_span',
  'srs_canonical',
  'skill_def',
  'metric_def',
  'employee_history',
  'calendar_rule',
]);

const DIMENSION_CATALOG_SEED = Object.freeze([
  Object.freeze({
    dimensionId: 'skill_level',
    values: Object.freeze(['1', '2', '3', '4', '5']),
    aliases: Object.freeze({
      junior: '2',
      mid: '3',
      senior: '4',
      lead: '5',
    }),
  }),
  Object.freeze({
    dimensionId: 'membership_role',
    values: Object.freeze(['member', 'lead', 'manager', 'admin']),
    aliases: Object.freeze({
      owner: 'admin',
      pm: 'manager',
    }),
  }),
]);

/**
 * @param {string} metricId
 * @returns {MetricCatalogEntry|null}
 */
function resolveMetric(metricId) {
  const id = String(metricId || '').trim();
  if (!id) return null;
  return METRIC_CATALOG_SEED.find((m) => m.metricId === id) || null;
}

/**
 * Promote raw skill names (run-scoped) into catalog entries. Cap 200.
 * @param {string[]} names
 * @param {string} [version]
 * @returns {{ version: string, skills: SkillCatalogEntry[] }}
 */
function buildSkillCatalogFromNames(names = [], version = 'cap-whitelist-v2') {
  const seen = new Set();
  const skills = [];
  for (const raw of names || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({
      skillId: `skill:${key.replace(/\s+/g, '_')}`,
      name,
      levelScale: { min: SKILL_LEVEL_MIN, max: SKILL_LEVEL_MAX },
    });
    if (skills.length >= 200) break;
  }
  return {
    version: String(version || 'cap-whitelist-v2').trim() || 'cap-whitelist-v2',
    skills,
  };
}

/**
 * Whether metric enforcement is on (default on). Rollback: G1_METRIC_ENFORCE=0
 */
function isMetricEnforceEnabled(env = process.env) {
  const raw = String(env.G1_METRIC_ENFORCE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/**
 * Validate skill catalog envelope projected into snapshot.
 * @param {unknown} catalog
 * @returns {{ ok: boolean, errors: string[], catalog?: { version: string, skills: SkillCatalogEntry[] } }}
 */
function validateSkillCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object') {
    return { ok: false, errors: ['skillCatalog required'] };
  }
  const version = String(catalog.version || '').trim();
  if (!version) errors.push('skillCatalog.version required');

  const rawSkills = Array.isArray(catalog.skills) ? catalog.skills : null;
  if (!rawSkills) {
    errors.push('skillCatalog.skills must be array');
    return { ok: false, errors };
  }

  const skills = [];
  for (let i = 0; i < rawSkills.length; i += 1) {
    const s = rawSkills[i];
    if (typeof s === 'string') {
      const name = s.trim();
      if (!name) {
        errors.push(`skills[${i}] empty string`);
        continue;
      }
      // Compat with as-is stub (string list) — promote to entry
      skills.push({
        skillId: `skill:${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
      });
      continue;
    }
    if (!s || typeof s !== 'object') {
      errors.push(`skills[${i}] invalid`);
      continue;
    }
    const name = String(s.name || '').trim();
    const skillId = String(s.skillId || '').trim() || (name ? `skill:${name.toLowerCase().replace(/\s+/g, '_')}` : '');
    if (!skillId || !name) {
      errors.push(`skills[${i}] skillId+name required`);
      continue;
    }
    skills.push({
      skillId,
      name,
      aliases: Array.isArray(s.aliases) ? s.aliases.map(String) : undefined,
      category: s.category != null ? String(s.category) : undefined,
      levelScale: s.levelScale || { min: SKILL_LEVEL_MIN, max: SKILL_LEVEL_MAX },
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], catalog: { version, skills } };
}

/**
 * @param {unknown} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateVectorDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['document required'] };
  if (!String(doc.sourceId || '').trim()) errors.push('sourceId required');
  if (!VECTOR_DOC_TYPES.includes(String(doc.docType || ''))) {
    errors.push(`docType must be one of ${VECTOR_DOC_TYPES.join('|')}`);
  }
  if (!String(doc.text || '').trim()) errors.push('text required');
  const meta = doc.metadata;
  if (!meta || typeof meta !== 'object') {
    errors.push('metadata required');
  } else if (!String(meta.snapshotId || '').trim()) {
    errors.push('metadata.snapshotId required (RULE-09)');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Catalog-miss policy for G3 (contract): unknown skill/metric → warn|error.
 * @param {'skill'|'metric'|'dimension'} kind
 * @param {string} id
 * @param {'error'|'warn'} [severity]
 */
function catalogMiss(kind, id, severity = 'error') {
  return {
    code: 'G1_CATALOG_MISS',
    kind: String(kind),
    id: String(id || ''),
    severity: severity === 'warn' ? 'warn' : 'error',
    message: `${kind} not found in G1 catalog: ${id}`,
  };
}

module.exports = {
  G1_CONTRACT_VERSION,
  SKILL_LEVEL_MIN,
  SKILL_LEVEL_MAX,
  METRIC_CATALOG_SEED,
  DIMENSION_CATALOG_SEED,
  VECTOR_DOC_TYPES,
  resolveMetric,
  buildSkillCatalogFromNames,
  isMetricEnforceEnabled,
  validateSkillCatalog,
  validateVectorDocument,
  catalogMiss,
};
