const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Server',
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Role',
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userRoleSchema.index({ userId: 1, serverId: 1 });
userRoleSchema.index({ roleId: 1 });
userRoleSchema.index({ userId: 1, serverId: 1, roleId: 1 }, { unique: true });

const UserRole = mongoose.model('UserRole', userRoleSchema);

module.exports = UserRole;



