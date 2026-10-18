import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const MESSAGES = Object.freeze({
  admin: 'Bạn không có quyền vào trang quản trị.',
  project: 'Bạn không có quyền mở trang này.',
});

export function routeDeniedMessage(kind) {
  return MESSAGES[kind] || '';
}

/** 403/404: không phải thành viên. 500 và lỗi mạng giữ màn thử lại. */
export function isProjectMembershipDenied(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  return status === 403 || status === 404;
}

/** Đọc state một lần, rồi xóa để refresh không lặp câu. */
export function useRouteDeniedNotice(expectedKind) {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (location.state?.routeDenied !== expectedKind) return;
    setMessage(routeDeniedMessage(expectedKind));
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null }
    );
  }, [expectedKind, location.hash, location.pathname, location.search, location.state, navigate]);

  return message;
}
