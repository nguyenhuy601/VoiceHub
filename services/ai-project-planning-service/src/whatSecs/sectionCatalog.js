/**
 * WHAT phase LLM sections — one registered tool per sec.
 * Order matches LLM_DERIVE_ORDER. FR runs before these (executeG4).
 */

const { LLM_DERIVE_ORDER, SECTION_BY_ENGINE, SECTION_LABEL } = require('../semantic/sectionDeriveRegistry');

const WHAT_SECTION_TOOLS = Object.freeze(
  LLM_DERIVE_ORDER.map((engineId) => ({
    engineId,
    section: SECTION_BY_ENGINE[engineId],
    toolName: `What${SECTION_LABEL[engineId]}Tool`,
  }))
);

const WHAT_FR_TOOL = 'WhatFrTool';

const WHAT_TOOL_BY_ENGINE = Object.freeze(
  Object.fromEntries(WHAT_SECTION_TOOLS.map((row) => [row.engineId, row.toolName]))
);

module.exports = {
  WHAT_SECTION_TOOLS,
  WHAT_FR_TOOL,
  WHAT_TOOL_BY_ENGINE,
};
