import NavigationSidebar from '../../components/Layout/NavigationSidebar';

function OrgChatPage() {
  // Trang chat doanh nghiệp sẽ được kết nối với organization-service và chat-service
  // trong các refactor tiếp theo (phòng ban, room, quyền theo role).
  return (
    <div className="h-screen flex overflow-hidden bg-[#020817] text-slate-100">
      <NavigationSidebar currentPage="Chat doanh nghiệp" />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Chat doanh nghiệp</h2>
          <p className="text-sm text-gray-400">
            Trang chat doanh nghiệp đang được xây dựng.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Vui lòng sử dụng Chat bạn bè cho tới khi hoàn tất.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OrgChatPage;

