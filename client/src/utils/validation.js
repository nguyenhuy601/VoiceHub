// Form validation utilities (Migrated from old codebase)

/**
 * Validate organization/server name
 */
export const validateOrganizationName = (name) => {
  if (!name || name.trim().length === 0) {
    return "Tên tổ chức không được để trống";
  }
  if (name.length < 3) {
    return "Tên tổ chức phải có ít nhất 3 ký tự";
  }
  if (name.length > 50) {
    return "Tên tổ chức không được vượt quá 50 ký tự";
  }
  return null;
};

/**
 * Validate description
 */
export const validateDescription = (description) => {
  if (!description || description.trim().length === 0) {
    return "Mô tả không được để trống";
  }
  if (description.length < 10) {
    return "Mô tả phải có ít nhất 10 ký tự";
  }
  if (description.length > 500) {
    return "Mô tả không được vượt quá 500 ký tự";
  }
  return null;
};

/**
 * Validate admin/user name
 */
export const validateUserName = (name) => {
  if (!name || name.trim().length === 0) {
    return "Tên không được để trống";
  }
  if (name.length < 2) {
    return "Tên phải có ít nhất 2 ký tự";
  }
  if (name.length > 30) {
    return "Tên không được vượt quá 30 ký tự";
  }
  return null;
};

/**
 * Validate email
 */
export const validateEmail = (email) => {
  if (!email || email.trim().length === 0) {
    return "Email không được để trống";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Email không hợp lệ";
  }
  return null;
};

/**
 * Validate password
 */
export const validatePassword = (password) => {
  if (!password || password.length === 0) {
    return "Mật khẩu không được để trống";
  }
  if (password.length < 6) {
    return "Mật khẩu phải có ít nhất 6 ký tự";
  }
  if (password.length > 50) {
    return "Mật khẩu không được vượt quá 50 ký tự";
  }
  return null;
};

/**
 * Validate message content
 */
export const validateMessage = (message) => {
  if (!message || message.trim().length === 0) {
    return "Tin nhắn không được để trống";
  }
  if (message.length > 2000) {
    return "Tin nhắn không được vượt quá 2000 ký tự";
  }
  return null;
};

/**
 * Validate file size (in bytes)
 */
export const validateFileSize = (size, maxSizeMB = 5) => {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (size > maxBytes) {
    return `Kích thước file không được vượt quá ${maxSizeMB}MB`;
  }
  return null;
};

/**
 * Validate image file type
 */
export const validateImageType = (type) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(type)) {
    return "Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)";
  }
  return null;
};

/**
 * Validate department name
 */
export const validateDepartmentName = (name) => {
  if (!name || name.trim().length === 0) {
    return "Tên phòng ban không được để trống";
  }
  if (name.length < 3) {
    return "Tên phòng ban phải có ít nhất 3 ký tự";
  }
  if (name.length > 50) {
    return "Tên phòng ban không được vượt quá 50 ký tự";
  }
  return null;
};

/**
 * Validate team name
 */
export const validateTeamName = (name) => {
  if (!name || name.trim().length === 0) {
    return "Tên nhóm không được để trống";
  }
  if (name.length < 3) {
    return "Tên nhóm phải có ít nhất 3 ký tự";
  }
  if (name.length > 50) {
    return "Tên nhóm không được vượt quá 50 ký tự";
  }
  return null;
};

/**
 * Validate task title
 */
export const validateTaskTitle = (title) => {
  if (!title || title.trim().length === 0) {
    return "Tiêu đề công việc không được để trống";
  }
  if (title.length < 5) {
    return "Tiêu đề phải có ít nhất 5 ký tự";
  }
  if (title.length > 100) {
    return "Tiêu đề không được vượt quá 100 ký tự";
  }
  return null;
};

/**
 * Validate entire form
 */
export const validateForm = (fields, validators) => {
  const errors = {};
  
  Object.keys(validators).forEach((field) => {
    const validator = validators[field];
    const error = validator(fields[field]);
    if (error) {
      errors[field] = error;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
