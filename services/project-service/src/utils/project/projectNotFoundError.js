/**
 * Anti-enumeration: missing / inactive / !discover / legacy deny
 * all surface as the same 404 + errorCode.
 */
function makeProjectNotFoundError(message = 'Project không tồn tại') {
  const err = new Error(String(message || 'Project không tồn tại'));
  err.statusCode = 404;
  err.errorCode = 'PROJECT_NOT_FOUND';
  err.messageUser = String(message || 'Project không tồn tại');
  return err;
}

module.exports = {
  makeProjectNotFoundError,
  PROJECT_NOT_FOUND_CODE: 'PROJECT_NOT_FOUND',
};
