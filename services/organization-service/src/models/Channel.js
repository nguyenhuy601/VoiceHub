const { mongoose } = require('@enterprise/shared/config/mongo');

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['chat', 'voice', 'announcement'],
      default: 'chat',
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Project Chat: null = kênh cơ cấu org (backward compatible). */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    projectChannelKind: {
      type: String,
      enum: ['general', 'announcement', 'cross_team', 'team', 'workgroup'],
      default: undefined,
    },
    /** Work-group channels: parent task ID this channel belongs to. */
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectName: {
      type: String,
      default: '',
      trim: true,
    },
    projectTeamName: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

channelSchema.index({ organization: 1, department: 1, isActive: 1 });
channelSchema.index({ organization: 1, team: 1, isActive: 1 });
channelSchema.index(
  { organization: 1, projectId: 1, projectChannelKind: 1 },
  {
    unique: true,
    partialFilterExpression: {
      projectId: { $type: 'objectId' },
      projectChannelKind: { $in: ['general', 'announcement', 'cross_team'] },
    },
  }
);
channelSchema.index(
  { organization: 1, projectId: 1, team: 1 },
  {
    unique: true,
    partialFilterExpression: {
      projectChannelKind: 'team',
      team: { $type: 'objectId' },
    },
  }
);

module.exports = mongoose.model('Channel', channelSchema);
