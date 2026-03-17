import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Trang hồ sơ không còn được sử dụng.
// Khi truy cập trực tiếp /profile, tự động chuyển về dashboard (hoặc trang chính).
function ProfilePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
}

export default ProfilePage;
