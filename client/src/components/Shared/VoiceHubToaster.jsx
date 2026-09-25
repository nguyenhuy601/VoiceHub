import { Toaster } from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import { TOAST_DURATION } from '../../utils/appToast';

/**
 * react-hot-toast — style đồng bộ dark/light (figma surface).
 */
export default function VoiceHubToaster() {
  const { isDarkMode } = useTheme();

  const baseStyle = isDarkMode
    ? {
        background: 'hsl(222 22% 11%)',
        color: 'hsl(210 40% 98%)',
        border: '1px solid hsl(217 18% 24%)',
        borderRadius: '14px',
        padding: '12px 14px',
        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        fontWeight: 560,
        fontSize: '0.875rem',
        lineHeight: 1.45,
        maxWidth: 'min(400px, 92vw)',
      }
    : {
        background: '#ffffff',
        color: '#0f172a',
        border: '1px solid rgba(15, 23, 42, 0.1)',
        borderRadius: '14px',
        padding: '12px 14px',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        fontWeight: 560,
        fontSize: '0.875rem',
        lineHeight: 1.45,
        maxWidth: 'min(400px, 92vw)',
      };

  return (
    <Toaster
      position="top-right"
      gutter={10}
      reverseOrder={false}
      containerStyle={{
        top: 20,
        right: 20,
        zIndex: 9999,
      }}
      toastOptions={{
        duration: TOAST_DURATION.default,
        style: baseStyle,
        success: {
          duration: TOAST_DURATION.success,
          style: {
            ...baseStyle,
            border: isDarkMode
              ? '1px solid rgba(16, 185, 129, 0.38)'
              : '1px solid rgba(13, 148, 136, 0.3)',
          },
          iconTheme: isDarkMode
            ? { primary: '#34d399', secondary: 'hsl(222 22% 11%)' }
            : { primary: '#0d9488', secondary: '#ffffff' },
        },
        error: {
          duration: TOAST_DURATION.error,
          style: {
            ...baseStyle,
            border: isDarkMode
              ? '1px solid rgba(248, 113, 113, 0.42)'
              : '1px solid rgba(220, 38, 38, 0.3)',
          },
          iconTheme: isDarkMode
            ? { primary: '#f87171', secondary: 'hsl(222 22% 11%)' }
            : { primary: '#dc2626', secondary: '#ffffff' },
        },
        loading: {
          style: baseStyle,
          iconTheme: isDarkMode
            ? { primary: '#94a3b8', secondary: 'hsl(222 22% 11%)' }
            : { primary: '#0284c7', secondary: '#ffffff' },
        },
      }}
    />
  );
}
