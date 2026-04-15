import { useMemo, useState } from 'react';
import { Calendar, FileText, LayoutGrid, Link2, Phone } from 'lucide-react';

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

function avatarNode(friend) {
  const a = friend?.avatar;
  if (typeof a === 'string' && a.startsWith('http')) {
    return <img src={a} alt="" className="h-full w-full object-cover" />;
  }
  return <span className="text-3xl">{a || '👤'}</span>;
}

/**
 * Sidebar phải — chat 1-1: hồ sơ, lối tắt, tab, ghim / lịch (mockup).
 */
export default function FriendChatRightPanel({
  friend,
  messages = [],
  onMute,
  onPin,
  onCreateGroup,
}) {
  const [tab, setTab] = useState('chung');
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

  const daysSinceFirstMsg = useMemo(() => {
    const sorted = [...messages]
      .filter((m) => m?.createdAt)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!sorted.length) return null;
    const t = new Date(sorted[0].createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }, [messages]);

  const isOnline = friend?.status === 'online';

  if (!friend) return null;

  const tabs = [
    { id: 'chung', label: 'Chung', Icon: LayoutGrid },
    { id: 'files', label: 'Tệp', Icon: FileText },
    { id: 'links', label: 'Link', Icon: Link2 },
    { id: 'cal', label: 'Lịch', Icon: Calendar },
  ];

  return (
    <aside className="hidden h-full w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#0b0c14] lg:flex">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-4">
        <div className="relative mx-auto flex max-w-[240px] flex-col items-center">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-violet-700 to-fuchsia-600 ring-4 ring-[#0b0c14] shadow-xl">
            {avatarNode(friend)}
          </div>
          <span
            className={`absolute bottom-1 right-4 h-3.5 w-3.5 rounded-full border-2 border-[#0b0c14] ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-500'
            }`}
          />
        </div>
        <h4 className="mt-3 text-center text-lg font-bold text-white">{friend.name}</h4>
        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-violet-300/80">
          Thành viên VoiceHub
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Múi giờ</div>
            <div className="text-xs font-medium text-gray-200">GMT+7</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Trạng thái</div>
            <div className="text-xs font-medium text-emerald-400/90">
              {isOnline ? 'Đang rảnh' : 'Ngoại tuyến'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
          >
            <Phone className="h-4 w-4" />
            Gọi
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
          >
            <Calendar className="h-4 w-4" />
            Lịch
          </button>
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-2">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-t-lg py-2 text-[10px] font-semibold uppercase tracking-wide transition ${
              tab === id
                ? 'border-b-2 border-violet-500 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        <div className="px-3 py-3">
          <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Đã ghim
          </h5>
          <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs text-gray-500">
            Chưa có tin hoặc liên kết được ghim.
          </p>
        </div>

        <div className="border-t border-white/[0.06] px-3 py-3">
          <h5 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Lịch hôm nay
          </h5>
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-xs text-gray-500">
            Không có sự kiện chung — sẽ đồng bộ khi có tích hợp lịch.
          </p>
        </div>

        {tab === 'chung' && (
          <>
            <section className="border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setOpenMedia((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]"
              >
                Ảnh / video
                <span className="text-gray-500">{openMedia ? '▾' : '▸'}</span>
              </button>
              {openMedia && (
                <div className="px-3 pb-3">
                  {images.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500">Chưa có ảnh hoặc video.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {images.map((img) => (
                        <div
                          key={img.id}
                          className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-[#14151c] text-[10px] text-gray-500"
                        >
                          {img.preview?.startsWith('http') ? (
                            <img src={img.preview} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span>🖼️</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setOpenFiles((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]"
              >
                Tệp
                <span className="text-gray-500">{openFiles ? '▾' : '▸'}</span>
              </button>
              {openFiles && (
                <div className="space-y-2 px-3 pb-3">
                  {files.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500">Chưa có tệp.</p>
                  ) : (
                    files.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2"
                      >
                        <span className="text-lg">📄</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-white">{f.name}</div>
                          <div className="text-[10px] text-gray-500">{formatShortDate(f.at)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'files' && (
          <div className="border-t border-white/[0.06] px-3 py-3 text-xs text-gray-400">
            {files.length === 0 ? 'Chưa có tệp trong cuộc trò chuyện.' : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="truncate text-gray-200">
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'links' && (
          <div className="border-t border-white/[0.06] px-3 py-3">
            {links.length === 0 ? (
              <p className="text-xs text-gray-500">Chưa có link.</p>
            ) : (
              links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2 block rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-xs text-violet-300 hover:bg-white/[0.06]"
                >
                  <div className="truncate font-medium text-white">{l.title}</div>
                  <div className="truncate text-[11px] text-gray-500">{hostFromUrl(l.url)}</div>
                </a>
              ))
            )}
          </div>
        )}

        {tab === 'cal' && (
          <div className="border-t border-white/[0.06] px-3 py-4 text-center text-xs text-gray-500">
            Lịch chung sẽ hiển thị khi tích hợp calendar.
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/[0.06] px-3 py-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
              Ngày bắt đầu chat
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {daysSinceFirstMsg != null ? `${daysSinceFirstMsg}d` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
              Kênh chung
            </div>
            <div className="mt-1 text-lg font-bold text-white">1</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 border-t border-white/[0.06] px-2 py-3">
          <button
            type="button"
            onClick={onMute}
            className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-gray-400 hover:text-white"
          >
            Tắt thông báo
          </button>
          <button
            type="button"
            onClick={onPin}
            className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-gray-400 hover:text-white"
          >
            Ghim
          </button>
          <button
            type="button"
            onClick={onCreateGroup}
            className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-gray-400 hover:text-white"
          >
            Tạo nhóm
          </button>
        </div>
      </div>
    </aside>
  );
}
