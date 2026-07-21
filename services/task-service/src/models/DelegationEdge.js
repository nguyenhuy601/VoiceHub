const mongoose = require('../db');

/**
 * Delegation Graph edge: fromRole CanAssign → toRole (optional taskTypes).
 * Directed — không phải cây Position/Lead.
 */
const delegationEdgeSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'TaskBoard',
    },
    fromRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ProjectRole',
      index: true,
    },
    toRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ProjectRole',
      index: true,
    },
    /** Empty / ['*'] = mọi task type */
    taskTypes: {
      type: [String],
      default: () => ['*'],
    },
  },
  { timestamps: true }
);

delegationEdgeSchema.index(
  { boardId: 1, fromRoleId: 1, toRoleId: 1 },
  { unique: true }
);

module.exports = mongoose.model('DelegationEdge', delegationEdgeSchema);
