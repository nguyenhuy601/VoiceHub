/**
 * Shared standard descriptor field helpers for Group A/B tools.
 */

function std(partial) {
  return {
    version: 1,
    deterministic: true,
    llmCalls: 0,
    contextImpact: {},
    outputKeys: [],
    aliases: [],
    dependsOn: [],
    input: { data: [], context: [], policy: [] },
    ...partial,
    input: {
      data: partial.input?.data || partial.requiredData || [],
      context: partial.input?.context || partial.requiredContext || [],
      policy: partial.input?.policy || [],
    },
  };
}

module.exports = { std };
