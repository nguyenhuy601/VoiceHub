import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Bot, Sparkles, ClipboardList, BarChart2, Bell, Hash } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';

const LG_BREAKPOINT = 1024;
const PANEL_WIDTH = 380;
const PANEL_GUTTER = 12;

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildQuickActions(t) {
  return [
    { icon: Hash, label: t('aiPanel.quickSummary'), prompt: t('aiPanel.quickSummaryPrompt') },
    { icon: ClipboardList, label: t('aiPanel.quickTask'), prompt: t('aiPanel.quickTaskPrompt') },
    { icon: BarChart2, label: t('aiPanel.quickReport'), prompt: t('aiPanel.quickReportPrompt') },
    { icon: Bell, label: t('aiPanel.quickMeeting'), prompt: t('aiPanel.quickMeetingPrompt') },
    { icon: Sparkles, label: t('aiPanel.quickTranscript'), prompt: t('aiPanel.quickTranscriptPrompt') },
  ];
}

function getAIResponse(input, t) {
  const normalized = stripDiacritics(String(input || '').toLowerCase());
  if (normalized.includes('tom') || normalized.includes('summar')) {
    return t('aiPanel.responseSummary');
  }
  if (normalized.includes('task') || normalized.includes('tao') || normalized.includes('create')) {
    return t('aiPanel.responseTask');
  }
  if (normalized.includes('bao') || normalized.includes('report')) {
    return t('aiPanel.responseReport');
  }
  if (normalized.includes('nhac') || normalized.includes('hop') || normalized.includes('meeting')) {
    return t('aiPanel.responseMeeting');
  }
  return t('aiPanel.responseDefault');
}

function formatText(text) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className="my-0.5 leading-relaxed">
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j}>{part}</strong>
          ) : (
            <span key={j}>{part || '\u00A0'}</span>
          )
        )}
      </p>
    );
  });
}

function computeDesktopPosition(anchorRef, collapsed) {
  if (typeof window === 'undefined') return {};
  const panelW = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_GUTTER * 2);
  const maxH = Math.min(520, window.innerHeight - PANEL_GUTTER * 2);
  let left;
  let bottom = 20;

  const anchor = anchorRef?.current;
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    left = Math.max(PANEL_GUTTER, rect.left);
    bottom = Math.max(PANEL_GUTTER, window.innerHeight - rect.top + 8);
    left = Math.min(left, window.innerWidth - panelW - PANEL_GUTTER);
    if (bottom + maxH > window.innerHeight - PANEL_GUTTER) {
      bottom = PANEL_GUTTER;
    }
  } else {
    left = collapsed ? 88 : 222;
  }

  return { left, bottom, width: panelW };
}

export default function VoiceHubAIPanel({ onClose, anchorRef, collapsed = false }) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const TIME_LOCALE_EN = 'en-US';
  const TIME_LOCALE_VI = 'vi-VN';
  const timeTag = locale === 'en' ? TIME_LOCALE_EN : TIME_LOCALE_VI;
  const quickActions = buildQuickActions(t);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopStyle, setDesktopStyle] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const backdropRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const mobile = window.innerWidth < LG_BREAKPOINT;
    setIsMobile(mobile);
    if (!mobile) {
      setDesktopStyle(computeDesktopPosition(anchorRef, collapsed));
    }
  }, [anchorRef, collapsed]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    setMessages([
      {
        id: 'greeting',
        role: 'ai',
        text: t('aiPanel.greeting'),
        time: '',
      },
    ]);
  }, [t]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (backdropRef.current?.contains(e.target)) return;
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  const sendMessage = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: msg,
      time: new Date().toLocaleTimeString(timeTag, { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    const aiMsg = {
      id: (Date.now() + 1).toString(),
      role: 'ai',
      text: getAIResponse(msg, t),
      time: new Date().toLocaleTimeString(timeTag, { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
  };

  const panelMarkup = (
    <>
      {isMobile ? (
        <button
          ref={backdropRef}
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-[390] bg-black/40 lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        className={`fixed z-[400] flex min-h-0 animate-fade-in-fast flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl max-lg:inset-x-3 max-lg:bottom-4 max-lg:h-[min(70vh,520px)] max-lg:w-auto lg:h-[min(520px,calc(100vh-6rem))] lg:max-w-[min(380px,calc(100vw-1rem))]`}
        style={{
          boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',
          ...(isMobile ? {} : desktopStyle),
        }}
      >
        <div className="flex shrink-0 items-center gap-2.5 bg-gradient-to-br from-orange-500 to-orange-400 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
            <Bot size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.9375rem] font-bold tracking-tight text-white">{t('aiPanel.title')}</div>
            <div className="mt-px flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ADE80]" />
              <span className="text-[0.7rem] text-white/80">{t('aiPanel.poweredBy')}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2 [scrollbar-width:none]">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                title={a.label}
                onClick={() => sendMessage(a.prompt)}
                className="flex max-w-[9.5rem] shrink-0 items-center gap-1 truncate rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-orange-300 hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400"
              >
                <Icon size={12} className="shrink-0" />
                <span className="truncate">{a.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-muted/30 px-3.5 py-3 dark:bg-background/60">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.role === 'ai' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-400 shadow-md">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[82%] px-3 py-2.5 text-[0.8125rem] leading-relaxed ${
                  msg.role === 'ai'
                    ? 'rounded-[4px_12px_12px_12px] border border-border bg-background text-foreground shadow-sm'
                    : 'rounded-[12px_4px_12px_12px] bg-gradient-to-br from-orange-500 to-orange-400 text-white shadow-md'
                }`}
              >
                {formatText(msg.text)}
                {msg.time && (
                  <div className="mt-1 text-right text-[0.6rem] opacity-55">{msg.time}</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-400">
                <Bot size={14} className="text-white" />
              </div>
              <div className="flex items-center gap-1 rounded-[4px_12px_12px_12px] bg-white px-4 py-3 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-border bg-background px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-3xl border border-transparent bg-muted px-3 py-2 focus-within:border-orange-500/60 focus-within:ring-1 focus-within:ring-orange-500/30">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t('aiPanel.placeholder')}
              disabled={loading}
              className="min-w-0 flex-1 border-none bg-transparent text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-none transition ${
                input.trim() && !loading
                  ? 'cursor-pointer bg-gradient-to-br from-orange-500 to-orange-400 shadow-md'
                  : 'cursor-default bg-gray-200'
              }`}
            >
              <Send size={13} className={input.trim() && !loading ? 'text-white' : 'text-gray-400'} />
            </button>
          </div>
          <div className="mt-1.5 text-center text-[0.6rem] text-muted-foreground">{t('aiPanel.footer')}</div>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(panelMarkup, document.body);
}
