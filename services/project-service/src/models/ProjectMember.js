const mongoose = require('../db');

/**
 * Resource allocation — 1 row / user / project (SSOT cho join/leave/allocation).
 * ProjectMembership vẫn giữ multi-role; ProjectMember không lặp theo số role.
 *
 * `allocations[].allocationPct` = Planned Allocation (kế hoạch PM/RM nhập) —
 * không derive từ Task/Sprint/Worklog (Actual → Phase 3b).
 */
const allocationSegmentSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    allocationPct: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const projectMemberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Project',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    billable: {
      type: Boolean,
      default: false,
    },
    joinDate: {
      type: Date,
      default: null,
    },
    leaveDate: {
      type: Date,
      default: null,
    },
    allocations: {
      type: [allocationSegmentSchema],
      default: [],
    },
    allocationStatus: {
      type: String,
      enum: ['ok', 'overallocated'],
      default: 'ok',
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMemberSchema.index({ userId: 1, organizationId: 1, status: 1 });

module.exports = mongoose.model('ProjectMember', projectMemberSchema);
