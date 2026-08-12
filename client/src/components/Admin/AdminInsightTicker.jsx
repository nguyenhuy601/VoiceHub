import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_AI_INSIGHT_BOX,
  FIGMA_DASH_AI_INSIGHT_ICON,
  FIGMA_DASH_AI_INSIGHT_LABEL,
  FIGMA_DASH_AI_INSIGHT_TEXT,
} from '../Dashboard/figmaDashboardClasses';

export default function AdminInsightTicker({ messages = [], loading = false, href = '' }) {
  const { t } = useAppStrings();
  const [displayText, setDisplayText] = useState('');
  const [messageIdx, setMessageIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const safeMessages =
    Array.isArray(messages) && messages.length
      ? messages.filter(Boolean)
      : [loading ? t('adminDomains.insightLoading') : t('adminDomains.insightAllAssigned')];

  useEffect(() => {
    setDisplayText('');
    setMessageIdx(0);
    setCharIdx(0);
    setIsDeleting(false);
  }, [safeMessages.join('\u0001')]);

  useEffect(() => {
    const fullText = safeMessages[messageIdx % safeMessages.length];
    let timer;
    if (!isDeleting && charIdx < fullText.length) {
      timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, charIdx + 1));
        setCharIdx((c) => c + 1);
      }, 26);
    } else if (!isDeleting && charIdx === fullText.length) {
      timer = setTimeout(() => setIsDeleting(true), 3200);
    } else if (isDeleting && charIdx > 0) {
      timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, charIdx - 1));
        setCharIdx((c) => c - 1);
      }, 11);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setMessageIdx((i) => (i + 1) % safeMessages.length);
    }
    return () => clearTimeout(timer);
  }, [charIdx, isDeleting, messageIdx, safeMessages]);

  const content = (
    <div className={FIGMA_DASH_AI_INSIGHT_BOX}>
      <div className={FIGMA_DASH_AI_INSIGHT_ICON}>
        <Sparkles size={14} className="text-white" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className={FIGMA_DASH_AI_INSIGHT_LABEL}>{t('adminDomains.insightLabel')}</div>
        <p className={FIGMA_DASH_AI_INSIGHT_TEXT}>
          {displayText}
          <span className="ml-px inline-block h-[13px] w-0.5 animate-pulse bg-ai align-middle" />
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-[10px] outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        {content}
      </Link>
    );
  }

  return content;
}
