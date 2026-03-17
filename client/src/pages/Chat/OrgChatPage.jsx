import NavigationSidebar from '../../components/Layout/NavigationSidebar';

function OrgChatPage() {
  // Trang chat doanh nghiệp sẽ được kết nối với organization-service và chat-service
  // trong các refactor tiếp theo (phòng ban, room, quyền theo role).
  return (
    <div className="min-h-screen.flex">
      <NavigationSidebar currentPage="Chat doanh nghiệp" />
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Trang chat doanh nghiệp đang được xây dựng. 
        Vui lòng sử dụng Chat bạn bè cho tới khi hoàn tất.
      </div>
    </div>
  );
}

export default OrgChatPage;

