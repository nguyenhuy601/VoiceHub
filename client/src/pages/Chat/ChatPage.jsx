import { useState, useEffect } from "react";
import axios from "axios";

import NavigationSidebar from "../../components/Layout/NavigationSidebar";
import {
  Dropdown,
  GlassCard,
  GradientButton,
  Modal,
  StatusIndicator,
  Toast
} from "../../components/Shared";

function ChatPage() {

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [message, setMessage] = useState("");

  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [messages, setMessages] = useState([]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showThreadFor, setShowThreadFor] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(null);
  const [toast, setToast] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);

  const emojis = [
    "😊","😂","❤️","👍","🎉","🔥","✨","💯",
    "👏","🚀","💪","🙏","😍","🤔","😎","🎨"
  ];

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ---------------- FETCH DATA ---------------- */

  useEffect(() => {
    fetchChannels();
    fetchDirectMessages();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel);
    }
  }, [selectedChannel]);

  const fetchChannels = async () => {
    try {
      const res = await axios.get("/api/channels");
      setChannels(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDirectMessages = async () => {
    try {
      const res = await axios.get("/api/dm");
      setDirectMessages(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const res = await axios.get(`/api/messages/${channelId}`);
      setMessages(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  /* ---------------- SEND MESSAGE ---------------- */

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const res = await axios.post("/api/messages", {
        channelId: selectedChannel,
        content: message
      });

      setMessages(prev => [...prev, res.data]);
      setMessage("");

    } catch (err) {
      console.error(err);
    }
  };

  /* ---------------- CURRENT CHAT ---------------- */

  const getCurrentChat = () => {

    if (!selectedChannel) return null;

    if (selectedChannel.startsWith("dm-")) {
      const dm = directMessages.find(
        d => "dm-" + d.id === selectedChannel
      );
      return dm || null;
    }

    return channels.find(c => c.id === selectedChannel);
  };

  const currentChat = getCurrentChat();

  /* ---------------- MESSAGE ACTIONS ---------------- */

  const handleDeleteMessage = async (msgId) => {
    try {

      await axios.delete(`/api/messages/${msgId}`);

      setMessages(messages.filter(m => m.id !== msgId));

      showToast("Đã xóa tin nhắn");

    } catch (err) {
      console.error(err);
    }
  };

  const handleReaction = async (msgId, emoji) => {
    try {

      await axios.post(`/api/messages/${msgId}/reaction`, { emoji });

      showToast("Đã thêm reaction");

      setShowEmojiPicker(false);

    } catch (err) {
      console.error(err);
    }
  };

  /* ---------------- UI ---------------- */

  return (
<>
<div className="h-screen flex overflow-hidden bg-[#020817] text-slate-100">

<NavigationSidebar currentPage="Tin Nhắn"/>

<div className="flex-1 flex">

{/* CHANNEL SIDEBAR */}

<div className="w-72 bg-slate-900/60 border-r border-slate-800 p-4 overflow-y-auto scrollbar-overlay">

<h2 className="text-xl font-extrabold text-white mb-4">
Tin Nhắn
</h2>

{/* CHANNELS */}

<h3 className="text-sm font-bold text-gray-400 mb-3">
CÁC KÊNH
</h3>

<div className="space-y-2">

{channels.map(channel => (

<div
key={channel.id}
onClick={() => setSelectedChannel(channel.id)}
className="p-3 rounded-xl cursor-pointer bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70"
>

<div className="flex items-center gap-3">

<span className="text-xl">
{channel.icon}
</span>

<div className="flex-1">

<div className="font-semibold text-white">
{channel.name}
</div>

<div className="text-xs text-gray-400">
{channel.members} thành viên
</div>

</div>
</div>
</div>
))}
</div>

<button
onClick={() => setShowCreateChannelModal(true)}
className="w-full mt-3 py-2 bg-[#040f2a] border border-slate-800 rounded-lg text-sm hover:bg-slate-800/70 transition-all"
>
+ Tạo kênh
</button>

{/* DIRECT MESSAGES */}

<h3 className="text-sm font-bold text-gray-400 mt-6 mb-3">
TIN NHẮN RIÊNG
</h3>

<div className="space-y-2">

{directMessages.map(dm => (

<div
key={dm.id}
onClick={() => setSelectedChannel("dm-" + dm.id)}
className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer"
>

<div className="relative">

<div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-base">
{dm.avatar}
</div>

<StatusIndicator status={dm.status}/>

</div>

<div className="flex-1">

<div className="text-white font-medium text-sm">
{dm.name}
</div>

<div className="text-gray-500 text-xs">
{dm.lastMsg}
</div>

</div>

</div>

))}

</div>

</div>


{/* CHAT AREA */}

<div className="flex-1 flex flex-col">

{/* HEADER */}

<div className="p-3.5 bg-slate-900/60 border-b border-slate-800">

<h2 className="text-lg font-bold text-white">
{currentChat?.name || "Chọn kênh"}
</h2>

</div>


{/* MESSAGES */}

<div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-overlay">

{messages.map(msg => (

<div key={msg.id} className="flex gap-3">

<div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm">
{msg.user?.avatar}
</div>

<div>

<div className="text-white font-semibold text-xs">
{msg.user?.name}
</div>

<p className="text-sm text-gray-300">
{msg.content}
</p>

</div>

</div>

))}

</div>


{/* MESSAGE INPUT */}

<div className="p-3.5 bg-slate-900/60 border-t border-slate-800">

<div className="flex gap-2">

<input
type="text"
value={message}
onChange={(e)=>setMessage(e.target.value)}
className="flex-1 px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 text-sm text-white"
placeholder="Nhập tin nhắn..."
/>

<button
onClick={sendMessage}
className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-sm font-semibold hover:from-violet-400 hover:to-indigo-400 transition-all"
>
🚀
</button>

</div>

</div>

</div>

</div>

</div>


{/* EMOJI MODAL */}

<Modal
isOpen={showEmojiPicker}
onClose={()=>setShowEmojiPicker(false)}
title="Emoji"
size="sm"
>

<div className="grid grid-cols-8 gap-2">

{emojis.map((emoji,i)=>(
<button
key={i}
onClick={()=>handleReaction(selectedMessage,emoji)}
className="text-xl"
>
{emoji}
</button>
))}

</div>

</Modal>


{/* CREATE CHANNEL */}

<Modal
isOpen={showCreateChannelModal}
onClose={()=>setShowCreateChannelModal(false)}
title="Tạo Kênh"
>

<GradientButton
onClick={()=>showToast("Tạo kênh thành công")}
>
Tạo
</GradientButton>

</Modal>


{/* TOAST */}

{toast && (
<Toast
message={toast.message}
type={toast.type}
onClose={()=>setToast(null)}
/>
)}

</>

  );
}

export default ChatPage;