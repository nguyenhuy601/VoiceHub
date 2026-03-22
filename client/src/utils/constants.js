export const ROLES = {
  ORG_ADMIN: 'org_admin',
  DEPARTMENT_HEAD: 'department_head',
  TEAM_LEADER: 'team_leader',
  EMPLOYEE: 'employee',
};

export const ROLE_NAMES = {
  [ROLES.ORG_ADMIN]: 'Quản trị viên Tổ chức',
  [ROLES.DEPARTMENT_HEAD]: 'Trưởng phòng',
  [ROLES.TEAM_LEADER]: 'Trưởng nhóm',
  [ROLES.EMPLOYEE]: 'Nhân viên',
};

export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

export const TASK_STATUS_NAMES = {
  [TASK_STATUS.TODO]: 'Chưa làm',
  [TASK_STATUS.IN_PROGRESS]: 'Đang làm',
  [TASK_STATUS.REVIEW]: 'Đang review',
  [TASK_STATUS.DONE]: 'Hoàn thành',
  [TASK_STATUS.CANCELLED]: 'Đã hủy',
};

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

export const TASK_PRIORITY_NAMES = {
  [TASK_PRIORITY.LOW]: 'Thấp',
  [TASK_PRIORITY.MEDIUM]: 'Trung bình',
  [TASK_PRIORITY.HIGH]: 'Cao',
  [TASK_PRIORITY.URGENT]: 'Khẩn cấp',
};

export const USER_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  AWAY: 'away',
  BUSY: 'busy',
};

export const USER_STATUS_NAMES = {
  [USER_STATUS.ONLINE]: 'Đang làm việc',
  [USER_STATUS.OFFLINE]: 'Ngoại tuyến',
  [USER_STATUS.AWAY]: 'Vắng mặt',
  [USER_STATUS.BUSY]: 'Bận',
};

export const CHANNEL_TYPE = {
  TEXT: 'text',
  VOICE: 'voice',
  ANNOUNCEMENT: 'announcement',
};

export const MESSAGE_TYPE = {
  TEXT: 'text',
  FILE: 'file',
  IMAGE: 'image',
  SYSTEM: 'system',
};

export const FILE_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  ...ALLOWED_IMAGE_TYPES,
];
