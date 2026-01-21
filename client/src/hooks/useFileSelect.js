// Migrated from chatSelectFile hook
import { useState } from 'react';
import toast from 'react-hot-toast';
import { validateFileSize, validateImageType } from '../utils/validation';

export const useFileSelect = (maxSizeMB = 5) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const onSelectFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const typeError = validateImageType(file.type);
    if (typeError) {
      toast.error(typeError);
      return;
    }

    // Validate file size
    const sizeError = validateFileSize(file.size, maxSizeMB);
    if (sizeError) {
      toast.error(sizeError);
      return;
    }

    setSelectedFile(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl('');
  };

  return {
    selectedFile,
    previewUrl,
    onSelectFile,
    setSelectedFile,
    setPreviewUrl,
    clearFile,
  };
};
