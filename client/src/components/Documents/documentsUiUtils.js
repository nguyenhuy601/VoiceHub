import { File, FileText, Image } from 'lucide-react';
import { createTranslator } from '../../locales/buildStrings';

export const DOC_TYPE_ICON = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  xlsx: FileText,
  xls: FileText,
  md: FileText,
  sql: FileText,
  image: Image,
  figma: File,
};

export const DOC_TYPE_LABEL = {
  pdf: 'PDF',
  doc: 'Word',
  docx: 'Word',
  xlsx: 'Excel',
  xls: 'Excel',
  md: 'Markdown',
  figma: 'Figma',
  sql: 'SQL',
};

export function createDocumentsUiText(t) {
  return {
    docTypeFileFallback: t('documents.docTypeFileFallback'),
    relativeJustNow: t('documents.relativeJustNow'),
    relativeMinutesAgo: (n) => t('documents.relativeMinutesAgo', { n }),
    relativeHoursAgo: (n) => t('documents.relativeHoursAgo', { n }),
    relativeDaysAgo: (n) => t('documents.relativeDaysAgo', { n }),
  };
}

export const DOC_TYPE_COLOR = {
  pdf: '#EF4444',
  doc: '#2563EB',
  docx: '#2563EB',
  xlsx: '#10B981',
  xls: '#10B981',
  md: '#6366F1',
  image: '#F59E0B',
  figma: '#8B5CF6',
  sql: '#22D3EE',
};

export function inferDocType(doc) {
  const mime = String(doc?.mimeType || doc?.raw?.mimeType || '').toLowerCase();
  const name = String(doc?.name || doc?.raw?.name || doc?.raw?.title || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('document') || name.endsWith('.doc') || name.endsWith('.docx'))
    return 'docx';
  if (mime.includes('sheet') || mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls'))
    return 'xlsx';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
  if (name.endsWith('.md')) return 'md';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.fig')) return 'figma';
  return 'doc';
}

export function docTypeColor(type) {
  return DOC_TYPE_COLOR[type] || '#6366F1';
}

export function docTypeLabel(type, { t, locale = 'vi' } = {}) {
  if (type === 'image') {
    if (typeof t === 'function') return t('documents.docTypeImage');
    return createTranslator(locale)('documents.docTypeImage');
  }
  if (DOC_TYPE_LABEL[type]) return DOC_TYPE_LABEL[type];
  if (typeof t === 'function') return t('documents.docTypeFileFallback');
  return createTranslator(locale)('documents.docTypeFileFallback');
}

export function readOcrFromRaw(raw) {
  const meta = raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  const status = String(meta.ocrStatus || raw?.ocrStatus || 'idle').toLowerCase();
  const progress = Number(meta.ocrProgress ?? raw?.ocrProgress ?? 0);
  return {
    ocrStatus: ['processing', 'done', 'idle'].includes(status) ? status : 'idle',
    ocrProgress: Number.isFinite(progress) ? progress : 0,
  };
}

export function formatRelativeVi(iso, { t, locale = 'vi' } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const vi = locale !== 'en';
  const tt = typeof t === 'function' ? t : createTranslator(locale);
  if (mins < 1) return tt('documents.relativeJustNow');
  if (mins < 60) {
    if (vi) return tt('documents.relativeMinutesAgo', { n: mins });
    return tt('documents.relativeMinutesAgo', { n: mins });
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return tt('documents.relativeHoursAgo', { n: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return tt('documents.relativeDaysAgo', { n: days });
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return tt('documents.relativeWeeksAgo', { n: weeks });
  return d.toLocaleDateString(vi ? 'vi-VN' : 'en-US');
}

export function sortDocuments(list, sortKey) {
  const items = [...list];
  if (sortKey === 'name') {
    items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  } else if (sortKey === 'size') {
    items.sort((a, b) => (Number(b.raw?.fileSize) || 0) - (Number(a.raw?.fileSize) || 0));
  } else if (sortKey === 'type') {
    items.sort((a, b) => String(a.docType || '').localeCompare(String(b.docType || ''), 'vi'));
  } else {
    items.sort(
      (a, b) =>
        new Date(b.raw?.updatedAt || b.raw?.createdAt || 0).getTime() -
        new Date(a.raw?.updatedAt || a.raw?.createdAt || 0).getTime()
    );
  }
  return items;
}
