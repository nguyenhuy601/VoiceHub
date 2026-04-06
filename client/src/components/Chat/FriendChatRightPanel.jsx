import { useMemo, useState } from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const raw = text.match(URL_REGEX);
  return raw ? [...new Set(raw)] : [];
}

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Tên hiển thị tệp: ưu tiên MongoDB fileMeta.originalName, không dùng UUID trong path URL. */
function fileDisplayName(message) {
  const fm = message?.fileMeta;
  const original = typeof fm?.originalName === 'string' ? fm.originalName.trim() : '';
  if (original) return original;

  const content = String(message?.content ?? '');
  if (!/^https?:\/\//i.test(content)) return 'Tệp đính kèm';
  try {
    const pathOnly = content.split('?')[0];
    const u = new URL(pathOnly);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    const decoded = decodeURIComponent(last.replace(/\+/g, ' '));
    const stripped = decoded.replace(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}_/i, '');
    return stripped || decoded || 'Tệp đính kèm';
  } catch {
    return 'Tệp đính kèm';
  }
}

function isStorageAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /storage\.googleapis\.com|firebasestorage\.app|googleapis\.com\/storage/i.test(url);
}

/**
 * Sidebar phải: thông tin bạn + ảnh / file / link trích từ tin nhắn DM hiện tại.
 */
export default function FriendChatRightPanel({
  friend,
  messages = [],
  onMute,
  onPin,
  onCreateGroup,
}) {
  const [openMedia, setOpenMedia] = useState(true);
  const [openFiles, setOpenFiles] = useState(true);
  const [openLinks, setOpenLinks] = useState(true);

  const { images, files, links } = useMemo(() => {
    const imgs = [];
    const flist = [];
    const linkItems = [];

    for (const m of messages) {
      if (!m) continue;
      const t = m.messageType || 'text';
      const content = String(m.content ?? '');
      const id = m._id || m.id;

      if (t === 'image') {
        imgs.push({ id, preview: content, at: m.createdAt });
      } else if (t === 'file') {
        flist.push({
          id,
          name: fileDisplayName(m),
          at: m.createdAt,
          url: /^https?:\/\//i.test(content) ? content : null,
        });
      }

      const urls = extractUrls(content);
      const contentPath = content.split('?')[0];
      for (const url of urls) {
        const urlPath = url.split('?')[0];
        if ((t === 'file' || t === 'image') && urlPath === contentPath) {
          continue;
        }
        if (t === 'file' && isStorageAttachmentUrl(url)) {
          continue;
        }
        linkItems.push({
          id: `${id}-${url}`,
          url,
          title: url.length > 48 ? `${url.slice(0, 45)}…` : url,
          at: m.createdAt,
        });
      }
    }

    const byTime = (a, b) =>
      new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();

    return {
      images: [...imgs].sort(byTime).slice(0, 8),
      files: [...flist].sort(byTime).slice(0, 6),
      links: [...linkItems].sort(byTime).slice(0, 8),
    };
  }, [messages]);

  const isOnline = friend?.status === 'online';

  if (!friend) return null;

  return (
    <aside className="hidden lg:flex w-[min(300px,30vw)] shrink-0 flex-col border-l border-white/[0.06] bg-[#0f1218] h-full overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-3 text-center">
        <h3 className="text-sm font-semibold text-white">Thông tin hội thoại</h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-overlay">
        {/* Banner + avatar — phong cách tối như ref */}
        <div className="relative px-3 pt-3 pb-4">
          <div className="h-24 rounded-xl bg-gradient-to-br from-violet-900/80 via-indigo-900/60 to-[#0b0e14] border border-white/[0.06]" />
          <div className="relative -mt-10 flex flex-col items-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#8e44ad] to-pink-500 flex items-center justify-center text-3xl ring-4 ring-[#0f1218] shadow-lg">
                {friend.avatar}
              </div>
              <span
                className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[#0f1218] ${
                  isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                }`}
                title={isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <h4 className="text-lg font-bold text-white text-center truncate max-w-[240px]">
                {friend.name}
              </h4>
              <button
                type="button"
                className="text-[#8e9297] hover:text-white p-1 rounded-lg hover:bg-white/5"
                title="Đổi tên gợi nhớ (sắp có)"
                aria-label="Chỉnh sửa"
              >
                ✏️
              </button>
            </div>
            <p className="text-xs text-[#8e9297] mt-0.5">
              {isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
            </p>
          </div>
        </div>

        {/* Nút nhanh */}
        <div className="px-3 pb-4 flex justify-center gap-2 border-b border-white/[0.06]">
          {[
            { key: 'mute', icon: '🔕', label: 'Tắt thông báo', onClick: onMute },
            { key: 'pin', icon: '📌', label: 'Ghim hội thoại', onClick: onPin },
            { key: 'group', icon: '👥', label: 'Tạo nhóm', onClick: onCreateGroup },
          ].map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              className="flex flex-col items-center gap-1 rounded-xl bg-[#1a1d26] border border-white/[0.06] px-2 py-2 min-w-[4.5rem] hover:bg-[#22262f] transition text-[10px] text-[#c4c9d4]"
              title={a.label}
            >
              <span className="text-lg leading-none">{a.icon}</span>
              <span className="leading-tight text-center">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Ảnh / video */}
        <section className="border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setOpenMedia((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]"
          >
            Ảnh/Video
            <span className="text-[#8e9297]">{openMedia ? '▾' : '▸'}</span>
          </button>
          {openMedia && (
            <div className="px-3 pb-3">
              {images.length === 0 ? (
                <p className="text-xs text-[#8e9297] py-2">Chưa có ảnh hoặc video trong cuộc trò chuyện.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {images.map((img) => (
                      <div
                        key={img.id}
                        className="aspect-square rounded-lg bg-[#1a1d26] border border-white/[0.06] overflow-hidden flex items-center justify-center text-[10px] text-[#8e9297]"
                        title={formatShortDate(img.at)}
                      >
                        {img.preview?.startsWith('http') ? (
                          <img src={img.preview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="p-1 text-center line-clamp-3">🖼️</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 w-full py-2 rounded-lg bg-[#1a1d26] border border-white/[0.06] text-xs text-[#c4c9d4] hover:bg-[#22262f]"
                  >
                    Xem tất cả
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* File */}
        <section className="border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setOpenFiles((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]"
          >
            File
            <span className="text-[#8e9297]">{openFiles ? '▾' : '▸'}</span>
          </button>
          {openFiles && (
            <div className="px-3 pb-3 space-y-2">
              {files.length === 0 ? (
                <p className="text-xs text-[#8e9297] py-2">Chưa có tệp được chia sẻ.</p>
              ) : (
                <>
                  {files.map((f) => {
                    const row = (
                      <>
                        <span className="text-xl shrink-0">📄</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-white truncate" title={f.name}>
                            {f.name}
                          </div>
                          <div className="text-[10px] text-[#8e9297]">{formatShortDate(f.at)}</div>
                        </div>
                      </>
                    );
                    return f.url ? (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 rounded-lg bg-[#1a1d26]/80 border border-white/[0.06] p-2 hover:bg-[#22262f] transition"
                      >
                        {row}
                      </a>
                    ) : (
                      <div
                        key={f.id}
                        className="flex items-start gap-2 rounded-lg bg-[#1a1d26]/80 border border-white/[0.06] p-2"
                      >
                        {row}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg bg-[#1a1d26] border border-white/[0.06] text-xs text-[#c4c9d4] hover:bg-[#22262f]"
                  >
                    Xem tất cả
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Link */}
        <section className="pb-4">
          <button
            type="button"
            onClick={() => setOpenLinks((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]"
          >
            Link
            <span className="text-[#8e9297]">{openLinks ? '▾' : '▸'}</span>
          </button>
          {openLinks && (
            <div className="px-3 space-y-2">
              {links.length === 0 ? (
                <p className="text-xs text-[#8e9297] py-2">Chưa có liên kết trong tin nhắn.</p>
              ) : (
                links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg bg-[#1a1d26]/80 border border-white/[0.06] p-2 hover:bg-[#22262f] transition"
                  >
                    <div className="flex gap-2">
                      <span className="text-lg shrink-0">🔗</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate">{l.title}</div>
                        <div className="text-[11px] text-[#6b9fff] truncate">{hostFromUrl(l.url)}</div>
                        <div className="text-[10px] text-[#8e9297] mt-0.5">{formatShortDate(l.at)}</div>
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
