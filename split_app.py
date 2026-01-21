"""
Script tự động tách App.jsx thành các file riêng biệt
Giữ 100% code gốc, chỉ tách ra thành từng file
"""
import os
import re

# Đọc file App.jsx gốc
print("📖 Đọc file App.original.jsx...")
with open(r"d:\Công nghệ mới\Voice-Chat-App\client\src\App.original.jsx", "r", encoding="utf-8") as f:
    content = f.read()

print(f"✅ Đọc thành công: {len(content)} ký tự, {len(content.splitlines())} dòng\n")

# Tìm và tách từng page component
def find_function_code(content, func_name, start_marker, end_marker=None):
    """Tìm code của một function từ start_marker đến end_marker"""
    # Tìm vị trí bắt đầu
    start_match = re.search(start_marker, content, re.MULTILINE | re.DOTALL)
    if not start_match:
        print(f"❌ Không tìm thấy {func_name}")
        return None
    
    start_pos = start_match.start()
    
    # Tìm vị trí kết thúc
    if end_marker:
        # Tìm từ sau start_pos
        end_match = re.search(end_marker, content[start_pos:], re.MULTILINE | re.DOTALL)
        if end_match:
            end_pos = start_pos + end_match.start()
        else:
            print(f"⚠️  Không tìm thấy end marker cho {func_name}, dùng toàn bộ phần còn lại")
            end_pos = len(content)
    else:
        end_pos = len(content)
    
    # Lấy code
    code = content[start_pos:end_pos]
    
    # Tìm dòng function definition
    func_start = re.search(r'function ' + func_name + r'\s*\(', code)
    if func_start:
        code = code[func_start.start():]
    
    return code.strip()

# Định nghĩa các page cần tách
pages = [
    {
        'name': 'HomePage',
        'file': 'pages/Auth/HomePage.jsx',
        'start': r'// ============= HOME PAGE =============',
        'end': r'// ============= AUTH PAGES ============='
    },
    {
        'name': 'LoginPage', 
        'file': 'pages/Auth/LoginPage.jsx',
        'start': r'function LoginPage\(',
        'end': r'function RegisterPage\('
    },
    {
        'name': 'RegisterPage',
        'file': 'pages/Auth/RegisterPage.jsx', 
        'start': r'function RegisterPage\(',
        'end': r'// ============= DASHBOARD'
    },
    {
        'name': 'DashboardPage',
        'file': 'pages/Dashboard/DashboardPage.jsx',
        'start': r'// ============= DASHBOARD WITH 3-COLUMN LAYOUT =============',
        'end': r'// ============= CHAT PAGE'
    },
    {
        'name': 'ChatPage',
        'file': 'pages/Chat/ChatPage.jsx',
        'start': r'// ============= CHAT PAGE WITH UNIQUE DESIGN =============',
        'end': r'// ============= VOICE ROOM PAGE'
    },
    {
        'name': 'VoiceRoomPage',
        'file': 'pages/Voice/VoiceRoomPage.jsx',
        'start': r'// ============= VOICE ROOM PAGE =============',
        'end': r'// ============= TASKS PAGE'
    },
    {
        'name': 'TasksPage',
        'file': 'pages/Tasks/TasksPage.jsx',
        'start': r'// ============= TASKS PAGE =============',
        'end': r'// ============= REMAINING PAGES'
    },
    {
        'name': 'ProfilePage',
        'file': 'pages/Profile/ProfilePage.jsx',
        'start': r'function ProfilePage\(',
        'end': r'function OrganizationsPage\('
    },
    {
        'name': 'OrganizationsPage',
        'file': 'pages/Organization/OrganizationsPage.jsx',
        'start': r'function OrganizationsPage\(',
        'end': r'function FriendsPage\('
    },
    {
        'name': 'FriendsPage',
        'file': 'pages/Friends/FriendsPage.jsx',
        'start': r'function FriendsPage\(',
        'end': r'function DocumentsPage\('
    },
    {
        'name': 'DocumentsPage',
        'file': 'pages/Documents/DocumentsPage.jsx',
        'start': r'function DocumentsPage\(',
        'end': r'function NotificationsPage\('
    },
    {
        'name': 'NotificationsPage',
        'file': 'pages/Notifications/NotificationsPage.jsx',
        'start': r'function NotificationsPage\(',
        'end': r'// ============= CALENDAR PAGE'
    },
    {
        'name': 'CalendarPage',
        'file': 'pages/Calendar/CalendarPage.jsx',
        'start': r'// ============= CALENDAR PAGE =============',
        'end': r'function AnalyticsPage\('
    },
    {
        'name': 'AnalyticsPage',
        'file': 'pages/Analytics/AnalyticsPage.jsx',
        'start': r'function AnalyticsPage\(',
        'end': r'function SettingsPage\('
    },
    {
        'name': 'SettingsPage',
        'file': 'pages/Settings/SettingsPage.jsx',
        'start': r'function SettingsPage\(',
        'end': r'function NotFoundPage\('
    },
    {
        'name': 'NotFoundPage',
        'file': 'pages/NotFound/NotFoundPage.jsx',
        'start': r'function NotFoundPage\(',
        'end': r'// ============= MAIN APP'
    },
]

print("🔧 Bắt đầu tách các page components...\n")

# Tách từng page
for page in pages:
    print(f"📄 Đang tách {page['name']}...")
    
    code = find_function_code(content, page['name'], page['start'], page.get('end'))
    
    if code:
        # Tạo imports
        imports = """import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassCard, Modal, Dropdown, Toast, ConfirmDialog, GradientButton, StatusIndicator } from '../../components/Shared';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';

"""
        
        # Tạo export
        full_code = imports + code + f"\n\nexport default {page['name']};\n"
        
        # Ghi file
        file_path = os.path.join(r"d:\Công nghệ mới\Voice-Chat-App\client\src", page['file'])
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(full_code)
        
        print(f"   ✅ Đã tạo {page['file']} ({len(code)} ký tự)")
    else:
        print(f"   ❌ Không tìm thấy code cho {page['name']}")

print("\n✨ Hoàn thành tách file!")
