import { useState } from 'react';
import { Link } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';

function VoiceRoomPage() {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // grid or speaker
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const participants = [
    { name: 'Sarah Chen', avatar: '👩‍💼', speaking: true, video: true, muted: false, role: 'host', quality: 'excellent' },
    { name: 'Mike Ross', avatar: '👨‍💻', speaking: false, video: true, muted: false, role: 'member', quality: 'good' },
    { name: 'Emma Wilson', avatar: '👩‍🎨', speaking: false, video: false, muted: true, role: 'member', quality: 'good' },
    { name: 'David Kim', avatar: '👨‍🔬', speaking: false, video: true, muted: false, role: 'member', quality: 'poor' },
    { name: 'Bạn', avatar: '😊', speaking: !isMuted, video: !isVideoOff, muted: isMuted, role: 'moderator', quality: 'excellent' },
    { name: 'Lisa Park', avatar: '👩‍💼', speaking: false, video: true, muted: false, role: 'member', quality: 'good' }
  ];

  const getQualityColor = (quality) => {
    const colors = {
      excellent: 'text-green-400',
      good: 'text-yellow-400',
      poor: 'text-red-400'
    };
    return colors[quality] || 'text-gray-400';
  };

  const getQualityIcon = (quality) => {
    const icons = {
      excellent: '📶',
      good: '📡',
      poor: '⚠️'
    };
    return icons[quality] || '📶';
  };

  return (
    <>
      <div className="min-h-screen flex">
        <NavigationSidebar currentPage="Phòng Họp" />

        <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 glass-strong border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
              🎙️
            </div>
            <div>
              <h1 className="text-2xl font-black text-gradient">Họp Nhóm Hàng Ngày</h1>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-400">{participants.length} người tham gia</span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">Mã phòng: ABC-123</span>
                <span className="text-gray-600">•</span>
                <span className="flex items-center gap-1 text-gray-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  32:45
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRecording && (
              <div className="flex items-center gap-2 glass px-4 py-2 rounded-xl animate-pulse">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm text-red-400 font-bold">ĐANG GHI</span>
              </div>
            )}
            <button 
              onClick={() => setViewMode(viewMode === 'grid' ? 'speaker' : 'grid')}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-2"
            >
              <span>{viewMode === 'grid' ? '📊' : '👤'}</span>
              {viewMode === 'grid' ? 'Lưới' : 'Người nói'}
            </button>
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all text-sm font-semibold"
            >
              ⚙️ Cài đặt
            </button>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Main Video Area */}
          <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
            {/* Video Grid */}
            <div className={`grid gap-4 mb-6 ${ 
              viewMode === 'grid' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-1'
            }`}>
              {participants.map((participant, idx) => (
                <GlassCard 
                  key={idx} 
                  hover 
                  glow={participant.speaking}
                  className={`relative overflow-hidden group animate-scaleIn ${
                    viewMode === 'speaker' && idx > 0 ? 'hidden' : ''
                  } ${viewMode === 'speaker' && idx === 0 ? 'aspect-video' : 'aspect-video'}`}
                  style={{animationDelay: `${idx * 0.1}s`}}
                >
                  {/* Video Background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${
                    participant.video 
                      ? 'from-purple-900/30 to-pink-900/30' 
                      : 'from-gray-900 to-gray-800'
                  }`}>
                    {participant.video && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-6xl opacity-50">{participant.avatar}</div>
                      </div>
                    )}
                    {!participant.video && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-8xl">{participant.avatar}</div>
                      </div>
                    )}
                  </div>

                  {/* Speaking Indicator */}
                  {participant.speaking && (
                    <div className="absolute inset-0 border-4 border-green-400 rounded-xl animate-pulse"></div>
                  )}

                  {/* Participant Info Bar */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{participant.name}</span>
                        {participant.role === 'host' && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-xs font-bold text-white">
                            Host
                          </span>
                        )}
                        {participant.role === 'moderator' && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-xs font-bold text-white">
                            Mod
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {participant.muted ? (
                          <span className="text-red-400">🔇</span>
                        ) : (
                          <span className="text-green-400">🎤</span>
                        )}
                        {!participant.video && (
                          <span className="text-red-400">🚫</span>
                        )}
                        <span className={`text-xs ${getQualityColor(participant.quality)}`} title={`Chất lượng: ${participant.quality}`}>
                          {getQualityIcon(participant.quality)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button className="w-8 h-8 rounded-lg glass hover:bg-white/20 flex items-center justify-center text-sm" title="Ghim">
                      📌
                    </button>
                    <button className="w-8 h-8 rounded-lg glass hover:bg-white/20 flex items-center justify-center text-sm" title="Xem toàn màn hình">
                      🔍
                    </button>
                  </div>

                  {/* Hand Raised Indicator */}
                  {participant.name === 'Emma Wilson' && (
                    <div className="absolute top-3 left-3 animate-bounce">
                      <div className="glass px-3 py-1.5 rounded-full flex items-center gap-2">
                        <span className="text-xl">✋</span>
                        <span className="text-xs text-white font-bold">Giơ tay</span>
                      </div>
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>

            {/* Screen Sharing Preview */}
            {isScreenSharing && (
              <GlassCard className="mb-6 relative">
                <div className="aspect-video bg-gradient-to-br from-blue-900/30 to-cyan-900/30 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🖥️</div>
                    <div className="text-xl font-bold text-white">Đang chia sẻ màn hình</div>
                    <div className="text-gray-400 text-sm">Màn hình của bạn đang được chia sẻ với mọi người</div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsScreenSharing(false)}
                  className="absolute top-4 right-4 glass px-4 py-2 rounded-xl hover:bg-red-600 transition-all flex items-center gap-2 font-semibold"
                >
                  <span>🛑</span> Dừng chia sẻ
                </button>
              </GlassCard>
            )}

            {/* Meeting Info Cards */}
            <div className="grid grid-cols-3 gap-4">
              <GlassCard hover>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
                    ⏱️
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">32:45</div>
                    <div className="text-xs text-gray-400">Thời gian họp</div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard hover>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl">
                    👥
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">{participants.length}/50</div>
                    <div className="text-xs text-gray-400">Người tham gia</div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard hover>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-2xl">
                    📶
                  </div>
                  <div>
                    <div className="text-2xl font-black text-gradient">Tốt</div>
                    <div className="text-xs text-gray-400">Chất lượng kết nối</div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Right Sidebar - Participants & Chat */}
          {showChat && (
            <div className="w-80 glass-strong border-l border-white/10 flex flex-col">
              <div className="p-4 border-b border-white/10">
                <h3 className="text-lg font-bold text-white">Chat Cuộc Họp</h3>
              </div>
              <div className="flex-1 p-4 overflow-auto scrollbar-gradient space-y-3">
                {[
                  { user: 'Sarah', message: 'Chào mọi người! Sẵn sàng bắt đầu chưa?', time: '10:00' },
                  { user: 'Mike', message: 'Ok, bắt đầu thôi!', time: '10:01' },
                  { user: 'Emma', message: 'Mình có thể chia sẻ slides không?', time: '10:02' }
                ].map((msg, idx) => (
                  <div key={idx} className="glass p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-white">{msg.user}</span>
                      <span className="text-xs text-gray-500">{msg.time}</span>
                    </div>
                    <p className="text-sm text-gray-300">{msg.message}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <input
                  type="text"
                  placeholder="Nhập tin nhắn..."
                  className="w-full px-4 py-2 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="p-6 glass-strong border-t border-white/10 flex items-center justify-center gap-4">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110 ${
              isMuted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gradient-to-r from-purple-600 to-pink-600'
            }`}
            title={isMuted ? 'Bật micro' : 'Tắt micro'}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          
          <button
            onClick={() => setIsVideoOff(!isVideoOff)}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110 ${
              isVideoOff
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500'
            }`}
            title={isVideoOff ? 'Bật camera' : 'Tắt camera'}
          >
            {isVideoOff ? '🚫' : '📹'}
          </button>

          <button 
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110 ${
              isScreenSharing
                ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                : 'glass hover:bg-white/10'
            }`}
            title={isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
          >
            🖥️
          </button>

          <button 
            onClick={() => setIsRecording(!isRecording)}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                : 'glass hover:bg-white/10'
            }`}
            title={isRecording ? 'Dừng ghi' : 'Ghi cuộc họp'}
          >
            ⏺️
          </button>

          <button className="w-16 h-16 rounded-2xl glass hover:bg-white/10 flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110" title="Giơ tay">
            ✋
          </button>

          <button 
            onClick={() => setShowChat(!showChat)}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110 relative ${
              showChat ? 'bg-gradient-to-r from-purple-600 to-pink-600' : 'glass hover:bg-white/10'
            }`}
            title="Chat"
          >
            💬
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
              3
            </span>
          </button>

          <button 
            onClick={() => showToast("Đang mở cài đặt âm thanh...", "info")}
            className="w-16 h-16 rounded-2xl glass hover:bg-white/10 flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110" 
            title="Cài đặt âm thanh"
          >
            🎛️
          </button>

          <button 
            onClick={() => showToast("Đang mở hiệu ứng nền...", "info")}
            className="w-16 h-16 rounded-2xl glass hover:bg-white/10 flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110" 
            title="Hiệu ứng nền"
          >
            🎨
          </button>

          <Link to="/dashboard">
            <button className="w-16 h-16 rounded-2xl bg-red-600 hover:bg-red-700 flex items-center justify-center text-2xl transition-all duration-300 shadow-lg hover:scale-110" title="Rời phòng">
              📞
            </button>
          </Link>
        </div>
      </div>
    </div>

    {/* Settings Modal */}
    <Modal 
      isOpen={showSettingsModal} 
      onClose={() => setShowSettingsModal(false)}
      title="Cài Đặt Phòng Họp"
      size="lg"
    >
      <div className="space-y-6">
        {/* Audio Settings */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>🎤</span> Cài Đặt Âm Thanh
          </h3>
          <div className="space-y-4">
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-300">Microphone</label>
                <select className="glass px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option>Microphone mặc định</option>
                  <option>Microphone ngoài</option>
                  <option>Tai nghe Bluetooth</option>
                </select>
              </div>
              <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-gradient-to-r from-green-500 to-emerald-500"></div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-300">Speaker</label>
                <select className="glass px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option>Speaker mặc định</option>
                  <option>Tai nghe</option>
                  <option>Loa ngoài</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">🔊</span>
                <input type="range" min="0" max="100" defaultValue="75" className="flex-1" />
                <span className="text-sm text-white font-semibold">75%</span>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Noise Cancellation</div>
                  <div className="text-xs text-gray-400">Loại bỏ tiếng ồn nền</div>
                </div>
                <button className="w-12 h-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Echo Cancellation</div>
                  <div className="text-xs text-gray-400">Giảm tiếng vang</div>
                </div>
                <button className="w-12 h-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </button>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Video Settings */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📹</span> Cài Đặt Video
          </h3>
          <div className="space-y-4">
            <GlassCard>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-300">Camera</label>
                <select className="glass px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option>Camera mặc định</option>
                  <option>Camera ngoài</option>
                  <option>Camera laptop</option>
                </select>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-300">Chất Lượng Video</label>
                <select className="glass px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option>Tự động</option>
                  <option>HD (720p)</option>
                  <option>Full HD (1080p)</option>
                  <option>SD (480p)</option>
                </select>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Mirror Video</div>
                  <div className="text-xs text-gray-400">Lật ngược video</div>
                </div>
                <button className="w-12 h-6 rounded-full glass relative">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full"></div>
                </button>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Virtual Background</div>
                  <div className="text-xs text-gray-400">Hiệu ứng nền ảo</div>
                </div>
                <button className="glass px-3 py-1.5 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold">
                  Chọn Nền
                </button>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Network Settings */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📶</span> Thông Tin Kết Nối
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <GlassCard>
              <div className="text-center">
                <div className="text-2xl font-black text-gradient mb-1">32 ms</div>
                <div className="text-xs text-gray-400">Độ Trễ</div>
              </div>
            </GlassCard>
            <GlassCard>
              <div className="text-center">
                <div className="text-2xl font-black text-gradient mb-1">95%</div>
                <div className="text-xs text-gray-400">Chất Lượng</div>
              </div>
            </GlassCard>
            <GlassCard>
              <div className="text-center">
                <div className="text-2xl font-black text-gradient mb-1">5.2 MB/s</div>
                <div className="text-xs text-gray-400">Tốc Độ</div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Recording Settings */}
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>🎥</span> Cài Đặt Ghi Hình
          </h3>
          <GlassCard>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Tự động ghi hình</div>
                  <div className="text-xs text-gray-400">Ghi hình khi bắt đầu cuộc họp</div>
                </div>
                <button className="w-12 h-6 rounded-full glass relative">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full"></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-300">Chất lượng ghi</label>
                <select className="glass px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                  <option>HD (720p)</option>
                  <option>Full HD (1080p)</option>
                  <option>SD (480p)</option>
                </select>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <GradientButton 
            variant="primary" 
            onClick={() => {
              showToast("Đã lưu cài đặt", "success");
              setShowSettingsModal(false);
            }}
            className="flex-1"
          >
            ✅ Lưu Cài Đặt
          </GradientButton>
          <button 
            onClick={() => setShowSettingsModal(false)}
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
    </>
  );
}

export default VoiceRoomPage;
