/**
 * Shared data plane for WHAT and HOW.
 * Preparation keeps full source records. The compiler chooses a task profile.
 */

module.exports = {
  ...require('./canonicalStore'),
  ...require('./profiles'),
  ...require('./compileContext'),
};
