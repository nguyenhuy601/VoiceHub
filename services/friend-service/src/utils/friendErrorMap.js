const FRIEND_INTERNAL_ERROR = 'FRIEND_INTERNAL_ERROR';

/** Order matters: service wraps errors as `Error accepting friend request: <inner>`, so match by substring. */
const KNOWN_FRIEND_ERRORS = [
  { match: 'User not found', status: 404, errorCode: 'FRIEND_USER_NOT_FOUND', message: 'Không tìm thấy người dùng' },
  {
    match: 'Friend request already sent',
    status: 409,
    errorCode: 'FRIEND_REQUEST_EXISTS',
    message: 'Bạn đã gửi lời mời kết bạn cho người này rồi',
  },
  {
    match: 'Friend request already received',
    status: 409,
    errorCode: 'FRIEND_REQUEST_EXISTS',
    message: 'Người này đã gửi lời mời cho bạn — hãy chấp nhận trong danh sách lời mời',
  },
  { match: 'Already friends', status: 409, errorCode: 'FRIEND_ALREADY', message: 'Hai bạn đã là bạn bè' },
  {
    match: 'Cannot send friend request to blocked user',
    status: 403,
    errorCode: 'FRIEND_BLOCKED',
    message: 'Không thể gửi lời mời tới người đã bị chặn',
  },
  { match: 'Cannot add yourself', status: 400, errorCode: 'FRIEND_SELF', message: 'Không thể kết bạn với chính mình' },
  {
    match: 'temporarily unavailable',
    status: 503,
    errorCode: 'FRIEND_UNAVAILABLE',
    message: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
  },
  {
    match: 'Friend relationship not found',
    status: 404,
    errorCode: 'FRIEND_NOT_FOUND',
    message: 'Không tìm thấy quan hệ bạn bè',
  },
  // 400 (not 404): client api.js toasts every 404 globally → double toast with component toast.
  {
    match: 'Friend request not found',
    status: 400,
    errorCode: 'FRIEND_NOT_FOUND',
    message: 'Không tìm thấy lời mời kết bạn',
  },
  {
    match: 'Block relationship not found',
    status: 400,
    errorCode: 'FRIEND_NOT_FOUND',
    message: 'Không tìm thấy quan hệ chặn',
  },
  { match: 'Invalid user pair', status: 400, errorCode: 'FRIEND_INVALID_PAIR', message: 'Người dùng không hợp lệ' },
];

/**
 * @param {unknown} error
 * @returns {{ status: number, errorCode: string, message?: string }}
 */
function mapFriendError(error) {
  if (error?.errorCode === 'FRIEND_RATE_LIMITED' || error?.statusCode === 429) {
    return {
      status: 429,
      errorCode: 'FRIEND_RATE_LIMITED',
      message: error.message || 'Quá nhiều thao tác. Vui lòng thử lại sau.',
    };
  }
  const raw = String(error?.message || '');
  const known = KNOWN_FRIEND_ERRORS.find((entry) => raw.includes(entry.match));
  if (known) {
    return { status: known.status, errorCode: known.errorCode, message: known.message };
  }
  return { status: 500, errorCode: FRIEND_INTERNAL_ERROR };
}

function isExpectedFriendError(error) {
  const msg = String(error?.message || '');
  return (
    msg.includes('Friend request already') ||
    msg.includes('Already friends') ||
    msg.includes('Cannot send friend request') ||
    msg.includes('Cannot add yourself') ||
    error?.errorCode === 'FRIEND_RATE_LIMITED' ||
    error?.statusCode === 429
  );
}

module.exports = {
  mapFriendError,
  isExpectedFriendError,
  FRIEND_INTERNAL_ERROR,
};
