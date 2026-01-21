import { useState } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { Dropdown, GlassCard, GradientButton, Modal, StatusIndicator, Toast } from '../../components/Shared';

function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState('general');
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showThreadFor, setShowThreadFor] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [messageActions, setMessageActions] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '✨', '💯', '👏', '🚀', '💪', '🙏', '😍', '🤔', '😎', '🎨'];

  // Data arrays MUST be defined before getCurrentChat()
  const channels = [
    { id: 'general', name: 'Trò Chuyện Chung', icon: '💬', color: 'from-purple-600 to-pink-600', members: 124, unread: 5 },
    { id: 'random', name: 'Ngẫu Nhiên', icon: '🎲', color: 'from-blue-500 to-cyan-500', members: 89, unread: 0 },
    { id: 'tech', name: 'Công Nghệ', icon: '💻', color: 'from-green-500 to-emerald-500', members: 56, unread: 12 },
    { id: 'design', name: 'Thiết Kế', icon: '🎨', color: 'from-pink-500 to-rose-500', members: 34, unread: 0 },
    { id: 'marketing', name: 'Marketing', icon: '📢', color: 'from-orange-500 to-red-500', members: 45, unread: 3 }
  ];

  const directMessages = [
    { id: 'sarah', name: 'Sarah Chen', avatar: '👩‍💼', status: 'online', unread: 2, lastMsg: 'Đã gửi file thiết kế' },
    { id: 'mike', name: 'Mike Ross', avatar: '👨‍💻', status: 'online', unread: 0, lastMsg: 'Ok nhé! 👍' },
    { id: 'emma', name: 'Emma Wilson', avatar: '👩‍🎨', status: 'busy', unread: 0, lastMsg: 'Đang trong cuộc họp' },
    { id: 'david', name: 'David Kim', avatar: '👨‍🔬', status: 'away', unread: 1, lastMsg: 'Check email nha' }
  ];

  // Get current channel/DM info
  const getCurrentChat = () => {
    if (selectedChannel.startsWith('dm-')) {
      const dm = directMessages.find(d => 'dm-' + d.id === selectedChannel);
      return dm ? { name: dm.name, icon: dm.avatar, members: '1:1', status: dm.status } : null;
    }
    const channel = channels.find(c => c.id === selectedChannel);
    return channel || { name: 'Trò Chuyện Chung', icon: '💬', members: 124, color: 'from-purple-600 to-pink-600' };
  };

  const currentChat = getCurrentChat();

  const handleReaction = (msgId, emoji) => {
    showToast(`Đã thêm reaction ${emoji}`, "success");
    setShowEmojiPicker(false);
  };

  const handleDeleteMessage = (msgId) => {
    showToast("Đã xóa tin nhắn", "success");
    setMessageActions(null);
  };

  const handlePinMessage = (msgId) => {
    showToast("Đã ghim tin nhắn", "success");
    setMessageActions(null);
  };

  const messages = [
    { 
      id: 1, 
      user: 'Sarah Chen', 
      avatar: '👩‍💼', 
      message: 'Chào team! Mình vừa hoàn thành bản thiết kế mới 🎨', 
      time: '10:30 AM', 
      reactions: [
        { emoji: '❤️', count: 5, users: ['Mike', 'Emma', '+3'] },
        { emoji: '🔥', count: 3, users: ['David', 'Lisa', '+1'] },
        { emoji: '👍', count: 7, users: ['You', 'Tom', '+5'] }
      ],
      thread: 3,
      attachments: [{ type: 'image', name: 'ThietKe_v2.png', size: '2.5 MB', preview: '🖼️' }]
    },
    { 
      id: 2, 
      user: 'Mike Ross', 
      avatar: '👨‍💻', 
      message: 'Tuyệt vời! Bạn có thể chia sẻ trong #thiết-kế không?', 
      time: '10:32 AM', 
      reactions: [],
      thread: 0
    },
    { 
      id: 3, 
      user: 'Emma Wilson', 
      avatar: '👩‍🎨', 
      message: 'Mình thích bảng màu này lắm! 🎨✨', 
      time: '10:35 AM', 
      reactions: [
        { emoji: '😍', count: 4, users: ['Sarah', 'You', '+2'] },
        { emoji: '✨', count: 2, users: ['Mike', 'David'] }
      ],
      thread: 0
    },
    { 
      id: 4, 
      user: 'Bạn', 
      avatar: '😊', 
      message: 'Làm tốt lắm mọi người! Tiếp tục phát huy nhé 🚀', 
      time: '10:40 AM', 
      reactions: [
        { emoji: '🎉', count: 8, users: ['Everyone'] }
      ],
      thread: 0,
      isYou: true
    },
    {
      id: 5,
      user: 'David Kim',
      avatar: '👨‍🔬',
      message: '@Sarah Chen mình có thể lên lịch 1 cuộc họp để đánh giá không?',
      time: '10:45 AM',
      reactions: [],
      thread: 2,
      mentions: ['Sarah Chen']
    }
  ];

  return (
    <>
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage="Tin Nhắn" />

      <div className="flex-1 flex">
        {/* Channels & DMs Sidebar */}
        <div className="w-72 glass-strong p-4 border-r border-white/10 overflow-y-auto overflow-x-visible scrollbar-gradient">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-gradient mb-4">Tin Nhắn</h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Tìm kiếm kênh hoặc người..." 
                className="w-full px-4 py-2 pl-10 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>

          {/* Channels List */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 mb-3">CÁC KÊNH</h3>
            <div className="space-y-2">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all duration-300 group ${
                    selectedChannel === channel.id
                      ? 'bg-gradient-to-r ' + channel.color
                      : 'glass hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{channel.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {channel.name}
                        {channel.unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                            {channel.unread}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{channel.members} thành viên</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowCreateChannelModal(true)}
              className="w-full mt-2 py-2 glass rounded-lg text-sm hover:bg-white/10 transition-all text-gray-400"
            >
              + Tạo kênh mới
            </button>
          </div>

          {/* Direct Messages */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-3">TIN NHẮN RIÊNG</h3>
            <div className="space-y-2">
              {directMessages.map((dm) => (
                <div 
                  key={dm.id} 
                  onClick={() => setSelectedChannel('dm-' + dm.id)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-all group"
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                      {dm.avatar}
                    </div>
                    <StatusIndicator status={dm.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-white font-medium text-sm">{dm.name}</div>
                      {dm.unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                          {dm.unread}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs truncate">{dm.lastMsg}</div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 glass-strong border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${currentChat.color || 'from-purple-600 to-pink-600'} flex items-center justify-center text-2xl`}>
                {currentChat.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{currentChat.name}</h2>
                <div className="flex items-center gap-2 text-sm">
                  {currentChat.members !== '1:1' ? (
                    <>
                      <span className="text-gray-400">{currentChat.members} thành viên</span>
                      <span className="text-gray-600">•</span>
                      <span className="flex items-center gap-1 text-green-400">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        18 online
                      </span>
                    </>
                  ) : (
                    <span className={`flex items-center gap-1 ${
                      currentChat.status === 'online' ? 'text-green-400' :
                      currentChat.status === 'busy' ? 'text-orange-400' :
                      currentChat.status === 'away' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      <span className={`w-2 h-2 rounded-full animate-pulse ${
                        currentChat.status === 'online' ? 'bg-green-400' :
                        currentChat.status === 'busy' ? 'bg-orange-400' :
                        currentChat.status === 'away' ? 'bg-yellow-400' : 'bg-gray-400'
                      }`}></span>
                      {currentChat.status === 'online' ? 'Đang hoạt động' :
                       currentChat.status === 'busy' ? 'Bận' :
                       currentChat.status === 'away' ? 'Vắng mặt' : 'Offline'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => showToast('Ghim tin nhắn')}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all group" 
                title="Ghim"
              >
                <span className="group-hover:scale-110 transition-transform">📌</span>
              </button>
              <button 
                onClick={() => showToast('Thông báo kênh')}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all group" 
                title="Thông báo"
              >
                <span className="group-hover:scale-110 transition-transform">🔔</span>
              </button>
              <button 
                onClick={() => showToast('Tìm kiếm trong kênh')}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all group" 
                title="Tìm kiếm"
              >
                <span className="group-hover:scale-110 transition-transform">🔍</span>
              </button>
              <button 
                onClick={() => showToast('Cài đặt kênh')}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all group" 
                title="Cài đặt"
              >
                <span className="group-hover:scale-110 transition-transform">⚙️</span>
              </button>
            </div>
          </div>

          {/* Messages Area with Typing Indicator */}
          <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-4 animate-slideUp relative z-0 hover:z-10 ${msg.isYou ? 'flex-row-reverse' : ''}`}>
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${msg.isYou ? 'from-blue-600 to-cyan-600' : 'from-purple-600 to-pink-600'} flex items-center justify-center text-2xl flex-shrink-0`}>
                  {msg.avatar}
                </div>
                <div className={`flex-1 max-w-2xl ${msg.isYou ? 'flex flex-col items-end' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{msg.user}</span>
                    <span className="text-xs text-gray-500">{msg.time}</span>
                    {msg.thread > 0 && (
                      <span className="text-xs glass px-2 py-0.5 rounded-full">{msg.thread} phản hồi</span>
                    )}
                  </div>
                  <div className={`glass-strong p-4 rounded-2xl relative group ${
                    msg.isYou ? 'bg-gradient-to-r from-blue-600/20 to-cyan-600/20' : ''
                  }`}>
                    {msg.mentions && msg.mentions.length > 0 && (
                      <div className="mb-2">
                        {msg.mentions.map((mention, idx) => (
                          <span key={idx} className="text-purple-400 font-semibold">@{mention} </span>
                        ))}
                      </div>
                    )}
                    <p className="text-white">{msg.message}</p>
                    
                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.attachments.map((file, idx) => (
                          <div key={idx} className="glass rounded-lg p-3 flex items-center gap-3 hover:bg-white/10 transition-all">
                            <span className="text-3xl">{file.preview}</span>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{file.name}</div>
                              <div className="text-xs text-gray-400">{file.size}</div>
                            </div>
                            <button className="text-purple-400 text-sm hover:text-pink-400 transition-colors">Tải về</button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {msg.reactions.map((reaction, idx) => (
                          <button 
                            key={idx} 
                            className="glass px-3 py-1.5 rounded-full text-sm hover:bg-white/10 transition-all flex items-center gap-2 group"
                            title={reaction.users.join(', ')}
                          >
                            <span>{reaction.emoji}</span>
                            <span className="text-gray-400 group-hover:text-white transition-colors">{reaction.count}</span>
                          </button>
                        ))}
                        <button className="glass px-2 py-1.5 rounded-full text-sm hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100">
                          ➕
                        </button>
                      </div>
                    )}

                    {/* Message Actions */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button 
                        onClick={() => {
                          setSelectedMessage(msg.id);
                          setShowEmojiPicker(true);
                        }}
                        className="glass p-1.5 rounded-lg hover:bg-white/20 text-sm" 
                        title="Thêm reaction"
                      >
                        😊
                      </button>
                      <button 
                        onClick={() => setShowThreadFor(msg)}
                        className="glass p-1.5 rounded-lg hover:bg-white/20 text-sm" 
                        title="Trả lời"
                      >
                        💬
                      </button>
                      <Dropdown
                        trigger={
                          <button className="glass p-1.5 rounded-lg hover:bg-white/20 text-sm" title="Thêm">⋯</button>
                        }
                        align="right"
                      >
                        <div className="p-2 min-w-[180px]">
                          <button 
                            onClick={() => setEditingMessage(msg.id)}
                            className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white text-sm flex items-center gap-2"
                          >
                            <span>✏️</span> Chỉnh sửa
                          </button>
                          <button 
                            onClick={() => handlePinMessage(msg.id)}
                            className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white text-sm flex items-center gap-2"
                          >
                            <span>📌</span> Ghim
                          </button>
                          <button 
                            onClick={() => showToast("Đã copy tin nhắn", "success")}
                            className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white text-sm flex items-center gap-2"
                          >
                            <span>📋</span> Copy
                          </button>
                          <button 
                            onClick={() => showToast("Đã forward tin nhắn", "success")}
                            className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white text-sm flex items-center gap-2"
                          >
                            <span>↗️</span> Forward
                          </button>
                          {msg.attachments && msg.attachments.length > 0 && msg.attachments[0].preview === '🖼️' && (
                            <button 
                              onClick={() => setShowImagePreview(msg.attachments[0])}
                              className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white text-sm flex items-center gap-2"
                            >
                              <span>🔍</span> Xem ảnh
                            </button>
                          )}
                          <div className="h-px bg-white/10 my-2"></div>
                          <button 
                            onClick={() => {
                              if (confirm('Bạn có chắc muốn xóa tin nhắn này?')) {
                                handleDeleteMessage(msg.id);
                              }
                            }}
                            className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-red-400 text-sm flex items-center gap-2"
                          >
                            <span>🗑️</span> Xóa
                          </button>
                        </div>
                      </Dropdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex gap-4 animate-slideUp">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-2xl">
                  👩‍💻
                </div>
                <div className="glass-strong p-4 rounded-2xl">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Message Input */}
          <div className="p-4 glass-strong border-t border-white/10">
            {attachedFile && (
              <div className="mb-2 glass rounded-lg p-2 flex items-center gap-2">
                <span>📎</span>
                <span className="text-sm text-white flex-1">{attachedFile}</span>
                <button onClick={() => setAttachedFile(null)} className="text-red-400 text-sm">✕</button>
              </div>
            )}
            <div className="flex gap-2">
              <button 
                className="w-12 h-12 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all text-xl group"
                title="Đính kèm tệp"
                onClick={() => setAttachedFile('Document.pdf')}
              >
                <span className="group-hover:scale-110 transition-transform">📎</span>
              </button>
              <button 
                className="w-12 h-12 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all text-xl group"
                title="Chọn emoji"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                <span className="group-hover:scale-110 transition-transform">😊</span>
              </button>
              <button 
                className="w-12 h-12 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-all text-xl group"
                title="Ghi âm thoại"
              >
                <span className="group-hover:scale-110 transition-transform">🎙️</span>
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder="Nhập tin nhắn... (Hỗ trợ @mention, #tag, /lệnh)"
                className="flex-1 px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all outline-none text-white"
              />
              <button className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center hover:scale-110 transition-transform text-xl shadow-lg">
                🚀
              </button>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
              <span>💡 Tip: Nhấn / để xem các lệnh nhanh</span>
              <span>•</span>
              <span>Nhấn Shift+Enter để xuống dòng</span>
            </div>
          </div>
        </div>

        {/* Right Info Panel */}
        <div className="w-80 glass-strong p-6 border-l border-white/10 overflow-y-auto overflow-x-visible scrollbar-gradient">
          <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <span>ℹ️</span> Thông Tin Kênh
          </h3>
          
          <GlassCard className="mb-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="relative z-10">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <span>📝</span> Mô Tả
              </h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Kênh trò chuyện chung cho toàn bộ đội ngũ. Chia sẻ cập nhật, ý tưởng và kết nối với mọi người. Hãy tôn trọng và hỗ trợ lẫn nhau!
              </p>
            </div>
          </GlassCard>

          <div className="mb-6">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <span>📌</span> Tin Nhắn Đã Ghim
            </h4>
            <div className="space-y-2">
              {[
                { text: 'Chào mừng đến VoiceHub! 🎉', author: 'Quản trị viên', time: '2 ngày trước' },
                { text: 'Họp nhóm hàng tuần vào Thứ 2 lúc 10:00', author: 'Sarah', time: '1 tuần trước' },
                { text: 'Quy tắc kênh: Tôn trọng, Chuyên nghiệp, Thân thiện', author: 'Admin', time: '1 tháng trước' }
              ].map((pin, idx) => (
                <GlassCard key={idx} hover className="p-3 group cursor-pointer">
                  <p className="text-white text-sm mb-2">{pin.text}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">bởi {pin.author}</span>
                    <span className="text-gray-600">{pin.time}</span>
                  </div>
                  <button className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-purple-400 hover:text-pink-400">
                    Bỏ ghim
                  </button>
                </GlassCard>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <span>📁</span> Tệp Đã Chia Sẻ
            </h4>
            <div className="space-y-2">
              {[
                { name: 'ThietKe_UI_V2.fig', size: '4.8 MB', type: 'design', icon: '🎨', user: 'Sarah' },
                { name: 'DeXuat_Q4.pdf', size: '2.3 MB', type: 'document', icon: '📄', user: 'Mike' },
                { name: 'Video_Demo.mp4', size: '15.7 MB', type: 'video', icon: '🎬', user: 'Emma' }
              ].map((file, idx) => (
                <GlassCard key={idx} hover className="p-3 group cursor-pointer">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{file.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{file.size}</span>
                        <span>•</span>
                        <span>bởi {file.user}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="flex-1 py-1.5 glass rounded-lg text-xs hover:bg-white/10 transition-all">Tải về</button>
                    <button className="flex-1 py-1.5 glass rounded-lg text-xs hover:bg-white/10 transition-all">Xem</button>
                  </div>
                </GlassCard>
              ))}
            </div>
            <button className="w-full mt-2 py-2 glass rounded-lg text-sm hover:bg-white/10 transition-all text-gray-400">
              Xem tất cả →
            </button>
          </div>

          {/* Channel Stats */}
          <GlassCard>
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <span>📊</span> Thống Kê
            </h4>
            <div className="space-y-3">
              {[
                { label: 'Tổng tin nhắn', value: '12,458', icon: '💬' },
                { label: 'Thành viên hoạt động', value: '87%', icon: '📈' },
                { label: 'Tệp chia sẻ', value: '245', icon: '📎' },
                { label: 'Ngày tạo', value: '15/01/2024', icon: '📅' }
              ].map((stat, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{stat.icon}</span>
                    <span className="text-sm text-gray-400">{stat.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gradient">{stat.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Emoji Picker Modal */}
      <Modal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        title="Chọn Reaction"
        size="sm"
      >
        <div className="grid grid-cols-8 gap-2">
          {emojis.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => handleReaction(selectedMessage, emoji)}
              className="w-12 h-12 glass rounded-xl hover:bg-white/20 transition-all flex items-center justify-center text-2xl hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        isOpen={showImagePreview !== null}
        onClose={() => setShowImagePreview(null)}
        title="Xem Ảnh"
        size="xl"
      >
        {showImagePreview && (
          <div className="space-y-4">
            <div className="glass-strong rounded-2xl overflow-hidden">
              <img 
                src={showImagePreview.url || "https://via.placeholder.com/800x600"} 
                alt="Preview" 
                className="w-full h-auto max-h-[70vh] object-contain"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-semibold">{showImagePreview.name || "Image.png"}</div>
                <div className="text-sm text-gray-400">Gửi bởi {showImagePreview.user || "User"}</div>
              </div>
              <div className="flex gap-2">
                <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all">
                  Tải về
                </button>
                <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all">
                  Chia sẻ
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Thread Sidebar Modal */}
      <Modal
        isOpen={showThreadFor !== null}
        onClose={() => setShowThreadFor(null)}
        title="Thread Discussion"
        size="lg"
      >
        {showThreadFor && (
          <div className="space-y-4">
            {/* Original Message */}
            <GlassCard className="glass-strong">
              <div className="flex gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl flex-shrink-0">
                  {showThreadFor.avatar}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{showThreadFor.user}</span>
                    <span className="text-xs text-gray-500">{showThreadFor.time}</span>
                  </div>
                  <p className="text-gray-300">{showThreadFor.message}</p>
                </div>
              </div>
            </GlassCard>

            {/* Replies */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-400">{showThreadFor.replies || 0} phản hồi</h4>
              {Array(showThreadFor.replies || 2).fill(0).map((_, idx) => (
                <div key={idx} className="flex gap-3 p-3 glass-strong rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl flex-shrink-0">
                    {['👨‍💻', '👩‍🎨'][idx]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">{['Mike', 'Emma'][idx]}</span>
                      <span className="text-xs text-gray-500">{['5 phút', '10 phút'][idx]} trước</span>
                    </div>
                    <p className="text-sm text-gray-300">
                      {['Tuyệt vời! Mình thích design này lắm 👍', 'Đồng ý! Có thể add thêm animation không?'][idx]}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <div className="flex gap-2 pt-4 border-t border-white/10">
              <input
                type="text"
                placeholder="Trả lời trong thread..."
                className="flex-1 px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white"
              />
              <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-all text-white font-semibold">
                Gửi
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Channel Modal */}
      <Modal 
        isOpen={showCreateChannelModal} 
        onClose={() => setShowCreateChannelModal(false)}
        title="Tạo Kênh Mới"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Tên Kênh
            </label>
            <input 
              type="text"
              placeholder="Nhập tên kênh..."
              className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Icon Kênh
            </label>
            <div className="grid grid-cols-8 gap-2">
              {['💬', '🎯', '💻', '🎨', '📢', '🎮', '🎵', '📚', '🏆', '🔔', '⚡', '🌟', '🎭', '🎪', '🎨', '🎸'].map((emoji, idx) => (
                <button
                  key={idx}
                  className="w-10 h-10 glass rounded-lg hover:bg-white/10 transition-all text-2xl flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Mô Tả (tùy chọn)
            </label>
            <textarea 
              rows={3}
              placeholder="Mô tả về kênh này..."
              className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all resize-none"
            ></textarea>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Loại Kênh
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 glass rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <input type="radio" name="channelType" defaultChecked className="w-4 h-4" />
                <div className="flex-1">
                  <div className="font-semibold text-white">🔓 Công Khai</div>
                  <div className="text-xs text-gray-400">Mọi người đều có thể tham gia</div>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 glass rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                <input type="radio" name="channelType" className="w-4 h-4" />
                <div className="flex-1">
                  <div className="font-semibold text-white">🔒 Riêng Tư</div>
                  <div className="text-xs text-gray-400">Chỉ những người được mời</div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <GradientButton 
              variant="primary" 
              onClick={() => {
                showToast("Đã tạo kênh mới!", "success");
                setShowCreateChannelModal(false);
              }}
              className="flex-1"
            >
              ✅ Tạo Kênh
            </GradientButton>
            <button 
              onClick={() => setShowCreateChannelModal(false)}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              Hủy
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
    </>
  );
}

export default ChatPage;
