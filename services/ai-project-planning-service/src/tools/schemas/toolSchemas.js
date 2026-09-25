/**
 * Minimal JSON-schema-like descriptors for default planning tools.
 * Non-empty input/output/evidence schemas (properties required for registry asserts).
 */

const EmployeeMatchingTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      poolItems: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      recommendations: { type: 'array' },
      fte: { type: 'object' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      calculatedBy: { type: 'string' },
    },
  },
};

const EffortTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      pack: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      estimatedHoursTotal: { type: 'number' },
      tasks: { type: 'array' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      metric: { type: 'string' },
    },
  },
};

const RequirementAnalysisTool = {
  inputSchema: {
    type: 'object',
    properties: {
      snapshot: { type: 'object' },
      pack: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      functionalRequirements: { type: 'array' },
      hierarchyCandidates: { type: 'array' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      sourceId: { type: 'string' },
    },
  },
};

const ScheduleTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      calendar: { type: 'object' },
      projectStart: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      schedule: { type: 'array' },
      taskDates: { type: 'object' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      ruleId: { type: 'string' },
    },
  },
};

const ArchitectureTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      pack: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      components: { type: 'array' },
      dependencies: { type: 'array' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      calculatedBy: { type: 'string' },
    },
  },
};

const RiskTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      pack: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      risks: { type: 'array' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      metric: { type: 'string' },
    },
  },
};

const genericIo = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
      pack: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
    },
  },
  evidenceSchema: {
    type: 'object',
    properties: {
      sourceType: { type: 'string' },
      calculatedBy: { type: 'string' },
    },
  },
};

const SequencingTool = {
  inputSchema: {
    type: 'object',
    properties: {
      container: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      sequence: { type: 'object' },
      theoreticalCpm: { type: 'object' },
    },
  },
  evidenceSchema: genericIo.evidenceSchema,
};

const HierarchyTool = { ...genericIo };
const CapabilityTool = { ...genericIo };
const InsightsTool = { ...genericIo };
const WbsTool = { ...genericIo };
const DependencyTool = { ...genericIo };
const ProjectPlanTool = { ...genericIo };

module.exports = {
  EmployeeMatchingTool,
  EffortTool,
  RequirementAnalysisTool,
  ScheduleTool,
  ArchitectureTool,
  RiskTool,
  SequencingTool,
  HierarchyTool,
  CapabilityTool,
  InsightsTool,
  WbsTool,
  DependencyTool,
  ProjectPlanTool,
};
