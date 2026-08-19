const mongoose = require('../db');

// CẤM populate User/Organization/Server/Document — các model không đăng ký trong task-service.
// Dùng HTTP client hoặc enrich DTO sau query .lean().

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      maxlength: 500,
      default: '',
    },
    description: {
      type: String,
      maxlength: 12000,
      default: '',
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /**
     * Multi-slot assignments (P6). Dual-write: primary.userId ↔ assigneeId.
     * slot: primary | reviewer | approver | collaborator | qa_owner | devops_owner | watcher
     */
    assignments: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          slot: {
            type: String,
            enum: [
              'primary',
              'reviewer',
              'approver',
              'collaborator',
              'qa_owner',
              'devops_owner',
              'watcher',
            ],
            default: 'primary',
          },
          projectRoleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ProjectRole',
            default: null,
          },
        },
      ],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    /** Swimlane: team sở hữu việc (khác teamId = scope board). null = chưa gán team. */
    ownerTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true,
    },
    /** Work-group chat channel (kind 'workgroup'). Set on level-2 parent only. */
    workGroupChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskBoard',
      default: null,
      index: true,
    },
    /** Denorm từ board.projectId */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    /** Sub-task: parent card trên cùng board */
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    /** Sprint gắn thẻ (nullable). */
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null,
      index: true,
    },
    /** Epic (PlanningItem type=epic). */
    epicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlanningItem',
      default: null,
      index: true,
    },
    /** Feature (PlanningItem type=feature) — parent planning, additive. */
    featureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlanningItem',
      default: null,
      index: true,
    },
    issueType: {
      type: String,
      enum: ['task', 'bug', 'story'],
      default: 'task',
      index: true,
    },
    changeRequestIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ChangeRequest' }],
      default: [],
      index: true,
    },
    checklists: {
      type: [
        {
          title: { type: String, trim: true, default: 'Checklist', maxlength: 180 },
          items: {
            type: [
              {
                text: { type: String, trim: true, maxlength: 500 },
                done: { type: Boolean, default: false },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    /** Legacy field — app no longer reads/writes; kept for Mongo compatibility. */
    responsibilityKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      index: true,
    },
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskBoardList',
      default: null,
      index: true,
    },
    position: {
      type: Number,
      default: 1000,
      index: true,
    },
    departmentName: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      trim: true,
      default: 'todo',
      index: true,
    },
    priority: {
      type: String,
      trim: true,
      default: 'medium',
      maxlength: 32,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    /** Ngày bắt đầu (calendar). Máy chia giờ T2–T6 từ startDate → dueDate. */
    startDate: {
      type: Date,
      default: null,
    },
    /**
     * Planned work estimate in hours (Phase 3b).
     * Same unit as Worklog — not story points (P3b.2).
     */
    estimateHours: {
      type: Number,
      min: 0,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    attachments: [
      {
        documentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Document',
        },
        name: String,
        url: String,
      },
    ],
    comments: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        content: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    encV: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    sourceMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
taskSchema.index({ assigneeId: 1, status: 1 });
taskSchema.index({ organizationId: 1, status: 1 });
taskSchema.index({ organizationId: 1, divisionId: 1, status: 1 });
taskSchema.index({ organizationId: 1, departmentId: 1, status: 1 });
taskSchema.index({ organizationId: 1, teamId: 1, status: 1 });
taskSchema.index({ boardId: 1, listId: 1, position: 1, isActive: 1 });
taskSchema.index({ boardId: 1, ownerTeamId: 1, listId: 1, isActive: 1 });
taskSchema.index({ boardId: 1, status: 1, createdAt: -1 });
taskSchema.index({ projectId: 1, isActive: 1, createdAt: -1 });
taskSchema.index({ projectId: 1, sprintId: 1, isActive: 1 });
taskSchema.index({ projectId: 1, epicId: 1, isActive: 1 });
taskSchema.index({ projectId: 1, featureId: 1, isActive: 1 });
taskSchema.index({ parentTaskId: 1, isActive: 1 });
taskSchema.index({ serverId: 1 });
taskSchema.index({ createdBy: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ priority: 1, status: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;



