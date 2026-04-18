import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { useTheme } from '../../context/ThemeContext';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { organizationAPI } from '../../services/api/organizationAPI';

const unwrap = (payload) => payload?.data ?? payload;

/**
 * Cài đặt tổ chức full màn hình: sidebar app + 2 cột (mục | nội dung) trong OrganizationSettingsPanel.
 * Đường dẫn: /organizations/:orgId/settings?tab=join
 */
export default function OrganizationSettingsPage() {
  const { isDarkMode } = useTheme();
  const shell = isDarkMode ? 'flex min-h-screen bg-[#0b0e14]' : 'flex min-h-screen bg-[#f5f7fa]';
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = searchParams.get('tab') || undefined;

  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const payload = await organizationAPI.getOrganization(orgId);
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (!cancelled) setOrganization(o || null);
      } catch {
        if (!cancelled) setOrganization(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleOrganizationUpdated = () => {
    if (!orgId) return;
    organizationAPI
      .getOrganization(orgId)
      .then((payload) => {
        const data = unwrap(payload);
        const o = data?.data ?? data;
        if (o) setOrganization(o);
      })
      .catch(() => {});
  };

  if (!orgId) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>Thiếu mã tổ chức.</main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className={`flex flex-1 items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>Đang tải cài đặt…</main>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className={isDarkMode ? 'text-gray-400' : 'text-slate-600'}>Không tìm thấy tổ chức hoặc bạn không có quyền truy cập.</p>
          <button
            type="button"
            onClick={() => navigate('/organizations')}
            className="text-cyan-400 hover:underline"
          >
            Quay lại Tổ chức
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={shell}>
      <NavigationSidebar />
      <OrganizationSettingsPanel
        organization={organization}
        initialTab={initialTab}
        onBack={() => navigate('/organizations')}
        onOrganizationUpdated={handleOrganizationUpdated}
        onOrganizationDeleted={() => navigate('/organizations')}
      />
    </div>
  );
}
