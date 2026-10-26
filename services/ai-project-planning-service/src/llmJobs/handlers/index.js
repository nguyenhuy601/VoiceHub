const { JOB_TYPES } = require('../llmJobContract');
const { handleEchoStub } = require('./echoStub');
const { handleWhatSectionDerive } = require('./whatSectionDerive');
const {
  handleWhatFrSemantic,
  handleWhatFrConflict,
  handleWhatFrSynthesis,
} = require('./whatFrSemantic');
const { handleHowRisk } = require('./howRisk');
const { handleHowQuality } = require('./howQuality');
const { handleHowDependency } = require('./howDependency');
const { handleWbsChunk } = require('./wbsChunk');

const HANDLERS = Object.freeze({
  [JOB_TYPES.WHAT_SECTION_DERIVE]: handleWhatSectionDerive,
  [JOB_TYPES.WHAT_FR_SEMANTIC]: handleWhatFrSemantic,
  [JOB_TYPES.WHAT_FR_CONFLICT]: handleWhatFrConflict,
  [JOB_TYPES.WHAT_FR_SYNTHESIS]: handleWhatFrSynthesis,
  [JOB_TYPES.HOW_RISK]: handleHowRisk,
  [JOB_TYPES.HOW_QUALITY]: handleHowQuality,
  [JOB_TYPES.HOW_DEPENDENCY]: handleHowDependency,
  [JOB_TYPES.WBS_CHUNK]: handleWbsChunk,
});

function getHandler(jobType) {
  return HANDLERS[jobType] || null;
}

module.exports = {
  HANDLERS,
  getHandler,
  handleEchoStub,
};
