/** SemanticTask module stubs — contracts live in semanticTaskRegistry.js */
module.exports = {
  bg: require('../semanticTaskRegistry').getSemanticTask('bg'),
  br: require('../semanticTaskRegistry').getSemanticTask('br'),
  nfr: require('../semanticTaskRegistry').getSemanticTask('nfr'),
  scope: require('../semanticTaskRegistry').getSemanticTask('scope'),
  bpm: require('../semanticTaskRegistry').getSemanticTask('bpm'),
  interface: require('../semanticTaskRegistry').getSemanticTask('interface'),
  fr: require('../semanticTaskRegistry').getSemanticTask('fr'),
  uc: require('../semanticTaskRegistry').getSemanticTask('uc'),
  data: require('../semanticTaskRegistry').getSemanticTask('data'),
  glossary: require('../semanticTaskRegistry').getSemanticTask('glossary'),
  assumption: require('../semanticTaskRegistry').getSemanticTask('assumption'),
  traceability: require('../semanticTaskRegistry').getSemanticTask('traceability'),
};
