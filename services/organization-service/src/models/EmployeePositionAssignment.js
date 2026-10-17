const { mongoose } = require('@enterprise/shared/config/mongo');

/**
 * Employee holds an Organizational Position (authz inheritance source).
 */
const employeePositionAssignmentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalPosition',
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active',
      index: true,
    },
    startAt: {
      type: Date,
      default: Date.now,
    },
    endAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

employeePositionAssignmentSchema.index({ organizationId: 1, userId: 1, status: 1 });
employeePositionAssignmentSchema.index({ organizationId: 1, positionId: 1, status: 1 });

module.exports = mongoose.model('EmployeePositionAssignment', employeePositionAssignmentSchema);
