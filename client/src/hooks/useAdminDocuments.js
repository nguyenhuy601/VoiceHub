import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';

function mapDocument(doc) {
  return {
    _id: String(doc?._id || doc?.id || '').trim(),
    name: String(doc?.name || doc?.title || '').trim() || '—',
    mimeType: doc?.mimeType || '',
    fileSize: doc?.fileSize,
    updatedAt: doc?.updatedAt || doc?.createdAt,
  };
}

export function useAdminDocuments(orgId) {
  const { t } = useAppStrings();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/documents', {
        params: { limit: 100, organizationId: orgId },
      });
      const body = response?.data ?? response;
      const inner = body?.data ?? body;
      const list = Array.isArray(inner?.documents) ? inner.documents : Array.isArray(inner) ? inner : [];
      setDocuments(list.map(mapDocument).filter((row) => row._id));
    } catch (err) {
      const msg = resolveApiErrorMessage(err, { t, fallback: t('adminFiles.loadFail') });
      setError(msg);
      toast.error(msg);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return { documents, loading, error, loadDocuments };
}

export default useAdminDocuments;
