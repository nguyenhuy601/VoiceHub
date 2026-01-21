// Chat input component with validation (migrated logic)
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { BsImageFill } from 'react-icons/bs';
import { IoMdSend } from 'react-icons/io';
import { validateFileSize, validateImageType, validateMessage } from '../../utils/validation';

export const ChatInput = ({ onSendMessage, loading = false }) => {
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const typeError = validateImageType(file.type);
    if (typeError) {
      toast.error(typeError);
      return;
    }

    // Validate file size
    const sizeError = validateFileSize(file.size, 5);
    if (sizeError) {
      toast.error(sizeError);
      return;
    }

    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const trimmedMessage = message.trim();

    // Validation
    if (!selectedFile && !trimmedMessage) {
      toast.error('Tin nhắn không được để trống');
      return;
    }

    if (trimmedMessage) {
      const messageError = validateMessage(trimmedMessage);
      if (messageError) {
        toast.error(messageError);
        return;
      }
    }

    // Send message
    onSendMessage({
      content: trimmedMessage,
      attachment: selectedFile,
      previewUrl,
    });

    // Reset form
    setMessage('');
    setSelectedFile(null);
    setPreviewUrl('');
  };

  const removePreview = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="border-t border-gray-700 bg-gray-800 p-4">
      {previewUrl && (
        <div className="mb-3 relative inline-block">
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="max-w-xs max-h-40 rounded-lg border border-gray-600"
          />
          <button
            onClick={removePreview}
            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
          className="hidden"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-blue-400 transition"
          disabled={loading}
        >
          <BsImageFill size={20} />
        </button>

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Nhập tin nhắn..."
          className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={2000}
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || (!message.trim() && !selectedFile)}
          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full text-white transition flex items-center justify-center"
        >
          {loading ? (
            <AiOutlineLoading3Quarters className="animate-spin" size={20} />
          ) : (
            <IoMdSend size={20} />
          )}
        </button>
      </form>

      {message.length > 0 && (
        <div className="text-xs text-gray-400 mt-1 text-right">
          {message.length}/2000 ký tự
        </div>
      )}
    </div>
  );
};
