/* ========================================
   THEMECONTEXT.JSX - THEME MANAGEMENT
   Quản lý dark/light mode cho toàn app
   - Toggle giữa dark và light theme
   - Lưu preference vào localStorage
   - Auto apply theme khi reload
======================================== */

// Import hooks để build context
import { createContext, useContext, useEffect, useState } from 'react';

// Tạo ThemeContext - sẽ provide isDarkMode và toggleTheme
const ThemeContext = createContext();

/* ========================================
   CUSTOM HOOK: useTheme()
   Cách dùng: const { isDarkMode, toggleTheme } = useTheme();
   
   Component nào cần theme info → dùng hook này
   VD: Header component muốn show dark/light icon
======================================== */
function useTheme() {
  const context = useContext(ThemeContext);
  
  // Check xem có wrap trong ThemeProvider không
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  
  return context;
}

// Export useTheme để dùng trong components
export { useTheme };

/* ========================================
   THEMEPROVIDER COMPONENT
   Wrap ở ngoài cùng trong main.jsx
   Cung cấp theme state cho toàn app
======================================== */
function ThemeProvider({ children }) {
  /* ----- STATE: isDarkMode ----- */
  
  // State lưu dark mode preference
  // Initial value: lấy từ localStorage hoặc default = dark
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Lấy theme đã lưu từ localStorage
    const saved = localStorage.getItem('theme');
    
    // Nếu có saved → check = 'dark' không
    // Nếu không có → default = true (dark mode)
    return saved ? saved === 'dark' : true;
  });

  /* ========================================
     useEffect: APPLY THEME KHI THAY ĐỔI
     Chạy mỗi khi isDarkMode change
     - Lưu preference vào localStorage
     - Add/remove class 'dark' trên <html>
     - Tailwind sẽ dùng class này để style
  ======================================== */
  useEffect(() => {
    // Lưu theme vào localStorage để persist
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Lấy <html> element (document.documentElement)
    // Thêm/xóa class 'dark' để Tailwind apply dark: styles
    if (isDarkMode) {
      // Dark mode: remove 'light', add 'dark'
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      // Light mode: remove 'dark', add 'light'
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]); // Re-run khi isDarkMode thay đổi

  /* ========================================
     toggleTheme: FUNCTION ĐỂ SWITCH THEME
     Đảo ngược isDarkMode: true → false, false → true
     
     Component gọi hàm này khi user click toggle button
     VD: <button onClick={toggleTheme}>🌙/☀️</button>
  ======================================== */
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Return Provider với value chứa state và function
  // Mọi component con có thể access { isDarkMode, toggleTheme }
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Export ThemeProvider để dùng trong main.jsx
export { ThemeProvider };

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useTheme } from './context/ThemeContext';
   
   function Header() {
     const { isDarkMode, toggleTheme } = useTheme();
     
     return (
       <button onClick={toggleTheme}>
         {isDarkMode ? '🌙 Dark' : '☀️ Light'}
       </button>
     );
   }
   
   CSS TAILWIND:
   - Dùng prefix 'dark:' cho dark mode styles
   - VD: <div className="bg-white dark:bg-gray-900">
   - Khi isDarkMode=true → <html class="dark"> → dark: styles active
======================================== */
