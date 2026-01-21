// Error handling utilities

import toast from "react-hot-toast";
import { FirebaseErrorWithCode } from "../types";

/**
 * Display error toast with proper message
 */
export const showErrorToast = (message: string): void => {
  toast.error(message, {
    duration: 3000,
    style: {
      background: "#fff",
      color: "#EF4444",
      fontWeight: "600",
      fontSize: "15px",
      padding: "16px",
    },
  });
};

/**
 * Display success toast
 */
export const showSuccessToast = (message: string): void => {
  toast.success(message, {
    duration: 2000,
    style: {
      background: "#fff",
      color: "#10B981",
      fontWeight: "600",
      fontSize: "15px",
      padding: "16px",
    },
  });
};

/**
 * Handle Firebase errors with user-friendly messages
 */
export const handleFirebaseError = (error: unknown): void => {
  console.error("Firebase Error:", error);

  if (isFirebaseError(error)) {
    const errorMessages: Record<string, string> = {
      "permission-denied": "Bạn không có quyền thực hiện thao tác này",
      "not-found": "Không tìm thấy dữ liệu",
      "already-exists": "Dữ liệu đã tồn tại",
      "unauthenticated": "Vui lòng đăng nhập để tiếp tục",
      "resource-exhausted": "Đã vượt quá giới hạn, vui lòng thử lại sau",
      "network-request-failed": "Lỗi kết nối mạng, vui lòng kiểm tra internet",
    };

    const message = errorMessages[error.code || ""] || "Đã có lỗi xảy ra, vui lòng thử lại";
    showErrorToast(message);
  } else if (error instanceof Error) {
    showErrorToast(error.message);
  } else {
    showErrorToast("Đã có lỗi không xác định");
  }
};

/**
 * Type guard for Firebase errors
 */
export function isFirebaseError(error: unknown): error is FirebaseErrorWithCode {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as FirebaseErrorWithCode).code === "string"
  );
}

/**
 * Async error wrapper
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (errorMessage) {
      showErrorToast(errorMessage);
    } else {
      handleFirebaseError(error);
    }
    return null;
  }
}
