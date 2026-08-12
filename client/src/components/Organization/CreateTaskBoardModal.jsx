import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildCollaborateProjectsNewPath } from '../../utils/suitePathUtils';

/**
 * Compat shim — tạo dự án chuyển sang full-screen route (không còn Modal).
 * Parents cũ gọi isOpen=true sẽ được redirect.
 */
export default function CreateTaskBoardModal({
  isOpen,
  onClose,
  organizationId = '',
  initialValues = null,
  fromBriefId = '',
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    const orgId = String(organizationId || '').trim();
    if (!orgId) {
      onClose?.();
                return;
              }
    navigate(
      buildCollaborateProjectsNewPath(orgId, {
        from: 'hub',
        title: initialValues?.title || '',
        description: initialValues?.description || initialValues?.body || '',
        projectCode: initialValues?.projectCode || '',
        briefId: fromBriefId || '',
      })
    );
    onClose?.();
  }, [isOpen, organizationId, navigate, onClose, initialValues, fromBriefId]);

  return null;
}
