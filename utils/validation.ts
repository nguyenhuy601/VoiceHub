// Form validation utilities

import { CreateServerFormData } from "../types";

export interface ValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof CreateServerFormData, string>>;
}

/**
 * Validate server name
 */
export const validateServerName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "Tên server không được để trống";
  }
  if (name.length < 3) {
    return "Tên server phải có ít nhất 3 ký tự";
  }
  if (name.length > 50) {
    return "Tên server không được vượt quá 50 ký tự";
  }
  return null;
};

/**
 * Validate description
 */
export const validateDescription = (description: string): string | null => {
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
 * Validate admin name
 */
export const validateAdminName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "Tên admin không được để trống";
  }
  if (name.length < 2) {
    return "Tên admin phải có ít nhất 2 ký tự";
  }
  if (name.length > 30) {
    return "Tên admin không được vượt quá 30 ký tự";
  }
  return null;
};

/**
 * Validate server type
 */
export const validateServerType = (type: string): string | null => {
  if (!type || type.trim().length === 0) {
    return "Loại server không được để trống";
  }
  return null;
};

/**
 * Validate server country/region
 */
export const validateServerCountry = (country: string): string | null => {
  if (!country || country.trim().length === 0) {
    return "Khu vực server không được để trống";
  }
  return null;
};

/**
 * Validate entire create server form
 */
export const validateCreateServerForm = (
  data: CreateServerFormData
): ValidationResult => {
  const errors: Partial<Record<keyof CreateServerFormData, string>> = {};

  const serverNameError = validateServerName(data.serverName);
  if (serverNameError) errors.serverName = serverNameError;

  const descriptionError = validateDescription(data.description);
  if (descriptionError) errors.description = descriptionError;

  const adminNameError = validateAdminName(data.adminName);
  if (adminNameError) errors.adminName = adminNameError;

  const serverTypeError = validateServerType(data.serverType);
  if (serverTypeError) errors.serverType = serverTypeError;

  const serverCountryError = validateServerCountry(data.serverCountry);
  if (serverCountryError) errors.serverCountry = serverCountryError;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate message content
 */
export const validateMessage = (message: string): string | null => {
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
export const validateFileSize = (
  size: number,
  maxSizeMB: number = 5
): string | null => {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (size > maxBytes) {
    return `Kích thước file không được vượt quá ${maxSizeMB}MB`;
  }
  return null;
};

/**
 * Validate image file type
 */
export const validateImageType = (type: string): string | null => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(type)) {
    return "Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)";
  }
  return null;
};
