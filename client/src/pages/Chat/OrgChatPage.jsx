import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { useTheme } from '../../context/ThemeContext';

function OrgChatPage() {
  const { isDarkMode } = useTheme();
  const shell = isDarkMode
    ? 'h-screen flex overflow-hidden bg-[#050810] text-slate-100'
    : 'h-screen flex overflow-hidden bg-[#f5f7fa] text-slate-900';
  const card = isDarkMode
    ? 'w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#101827]/90 p-6 text-center shadow-xl backdrop-blur-sm'
    : 'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg';

  return (
    <div className={shell}>
      <NavigationSidebar currentPage="Chat doanh nghiệp" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className={card}>
          <h2 className={`mb-2 text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Chat doanh nghiệp
          </h2>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            Trang chat doanh nghiệp đang được xây dựng.
          </p>
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            Vui lòng sử dụng Chat bạn bè cho tới khi hoàn tất.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OrgChatPage;
