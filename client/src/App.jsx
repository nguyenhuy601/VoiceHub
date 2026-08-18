import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import BrandPageLoader from './components/Shared/BrandPageLoader';
import SuiteShellLayout from './components/Layout/SuiteShellLayout';
import CommunicateSidebar from './components/Layout/CommunicateSidebar';
import CollaborateSidebar from './components/Layout/CollaborateSidebar';
import AdminShellLayout from './components/Layout/AdminShellLayout';
import ProfileSidebar from './components/Layout/ProfileSidebar';
import SuiteRootRedirect from './components/Layout/SuiteRootRedirect';
import LegacyWorkspaceRedirect from './components/Layout/LegacyWorkspaceRedirect';
import LegacyPathRedirect from './components/Layout/LegacyPathRedirect';
import RouteErrorBoundary from './components/Shared/RouteErrorBoundary';

const LoginPage = lazy(() => import('./pages/Auth/LoginPage'));
const RegisterRedirect = lazy(() => import('./components/Auth/RegisterRedirect'));
const VerifyEmailPage = lazy(() => import('./pages/Auth/VerifyEmailPage'));
const AcceptCompanyInvitePage = lazy(() => import('./pages/Auth/AcceptCompanyInvitePage'));
const ForgotPasswordPage = lazy(() => import('./pages/Auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/Auth/ResetPasswordPage'));
const TermsOfServicePage = lazy(() => import('./pages/Auth/TermsOfServicePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/Auth/PrivacyPolicyPage'));
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));
const FriendChatPage = lazy(() => import('./pages/Chat/FriendChatPage'));
const VoiceRoomPage = lazy(() => import('./pages/Voice/VoiceRoomPage'));
const OrganizationsPage = lazy(() => import('./pages/Workspace/OrganizationsPage'));
const OrganizationSettingsPage = lazy(() => import('./pages/Workspace/OrganizationSettingsPage'));
const CompanyAdminLayout = lazy(() => import('./pages/Admin/CompanyAdminLayout'));
const AdminHubPage = lazy(() => import('./pages/Admin/AdminHubPage'));
const AdminDomainPage = lazy(() => import('./pages/Admin/AdminDomainPage'));
const AdminLegacyRedirect = lazy(() => import('./components/Layout/AdminLegacyRedirect'));
const ApprovalInboxPage = lazy(() => import('./features/approvals/ApprovalInboxPage'));
const JoinApplicationPage = lazy(() => import('./pages/Workspace/JoinApplicationPage'));
const CreateProjectWizardPage = lazy(() => import('./pages/Workspace/CreateProjectWizardPage'));
const NotificationsPage = lazy(() => import('./pages/Notifications/NotificationsPage'));
const DocumentsPage = lazy(() => import('./pages/Documents/DocumentsPage'));
const CalendarPage = lazy(() => import('./pages/Calendar/CalendarPage'));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage'));

const Protected = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<BrandPageLoader />}>
        <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterRedirect />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email-change" element={<VerifyEmailPage />} />
        <Route path="/accept-company-invite" element={<AcceptCompanyInvitePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

        {/* Suite root */}
        <Route
          path="/app"
          element={
            <Protected>
              <SuiteRootRedirect />
            </Protected>
          }
        />

        {/* Communicate suite */}
        <Route
          path="/app/communicate"
          element={
            <Protected>
              <SuiteShellLayout sidebar={<CommunicateSidebar />} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<DashboardPage suiteLayout suiteScope="communicate" />} />
          <Route path="chat/friends" element={<FriendChatPage suiteLayout />} />
          <Route path="voice" element={<VoiceRoomPage suiteLayout />} />
          <Route path="voice/:roomId" element={<VoiceRoomPage suiteLayout />} />
          <Route
            path="channels"
            element={<OrganizationsPage suiteMode="communicate" suiteLayout />}
          />
          <Route path="notifications" element={<NotificationsPage suiteLayout />} />
        </Route>

        {/* Full-screen Project Setup Wizard — outside SuiteShell (no sidebar) */}
        <Route
          path="/app/collaborate/projects/new"
          element={
            <Protected>
              <CreateProjectWizardPage />
            </Protected>
          }
        />
        <Route
          path="/app/admin/projects/create"
          element={
            <Protected>
              <CreateProjectWizardPage />
            </Protected>
          }
        />

        {/* Collaborate suite */}
        <Route
          path="/app/collaborate"
          element={
            <Protected>
              <SuiteShellLayout sidebar={<CollaborateSidebar />} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<DashboardPage suiteLayout suiteScope="collaborate" />} />
          <Route
            path="workspaces"
            element={<OrganizationsPage suiteMode="collaborate" suiteLayout />}
          />
          <Route
            path="tasks"
            element={<OrganizationsPage suiteMode="collaborate" workspaceTab="tasks" suiteLayout />}
          />
          <Route path="documents" element={<DocumentsPage suiteLayout />} />
          <Route
            path="notifications"
            element={<NotificationsPage orgScope suiteLayout />}
          />
          <Route path="organizations/:orgId/settings" element={<OrganizationSettingsPage suiteLayout />} />
          <Route path="admin" element={<AdminLegacyRedirect />} />
          <Route path="approvals" element={<ApprovalInboxPage suiteLayout />} />
          <Route path="join/:orgId" element={<JoinApplicationPage suiteLayout />} />
        </Route>

        {/* Admin suite — menu quản lý tách khỏi collaborate */}
        <Route
          path="/app/admin"
          element={
            <Protected>
              <AdminShellLayout />
            </Protected>
          }
        >
          <Route element={<CompanyAdminLayout />}>
            <Route index element={<AdminHubPage />} />
            <Route path="overview" element={<Navigate to="/app/admin" replace />} />
            <Route path="people" element={<Navigate to="/app/admin/users" replace />} />
            <Route path="approvals" element={<Navigate to="/app/admin/users" replace />} />
            <Route path="general" element={<Navigate to="/app/admin/system-config" replace />} />
            <Route path="structure" element={<Navigate to="/app/admin/system-config?tab=structure" replace />} />
            <Route path="roles" element={<Navigate to="/app/admin/rbac/roles" replace />} />
            <Route path="policy" element={<Navigate to="/app/admin/system-config/policy" replace />} />
            <Route path=":domain/*" element={<AdminDomainPage />} />
          </Route>
        </Route>

        <Route
          path="/app/me"
          element={
            <Protected>
              <SuiteShellLayout sidebar={<ProfileSidebar />} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage suiteLayout suiteScope="me" />} />
          <Route path="calendar" element={<CalendarPage suiteLayout />} />
          <Route path="settings" element={<SettingsPage suiteLayout />} />
        </Route>

        {/* Legacy redirects — giữ URL cũ (/dashboard, /chat/friends, /w/:slug, …) trỏ sang /app/* suite */}
        <Route path="/dashboard" element={<Navigate to="/app/communicate/overview" replace />} />
        <Route path="/calendar" element={<Navigate to="/app/me/calendar" replace />} />
        <Route path="/settings" element={<Navigate to="/app/me/settings" replace />} />
        <Route path="/profile" element={<Navigate to="/app/me/dashboard" replace />} />
        <Route path="/chat" element={<Navigate to="/app/communicate/chat/friends" replace />} />
        <Route path="/chat/friends" element={<Navigate to="/app/communicate/chat/friends" replace />} />
        <Route path="/chat/organization" element={<Navigate to="/app/collaborate/workspaces" replace />} />
        <Route path="/voice" element={<Navigate to="/app/communicate/voice" replace />} />
        <Route
          path="/voice/:roomId"
          element={<LegacyPathRedirect toTemplate="/app/communicate/voice/:roomId" />}
        />
        <Route path="/friends" element={<Navigate to="/app/communicate/chat/friends" replace />} />
        <Route path="/notifications" element={<Navigate to="/app/communicate/notifications" replace />} />
        <Route path="/notifications/organization" element={<Navigate to="/app/collaborate/notifications" replace />} />
        <Route path="/documents" element={<Navigate to="/app/collaborate/documents" replace />} />
        <Route path="/tasks" element={<Navigate to="/app/collaborate/tasks" replace />} />
        <Route path="/organizations" element={<Navigate to="/app/collaborate/workspaces" replace />} />
        <Route path="/workspaces" element={<Navigate to="/app/collaborate/workspaces" replace />} />
        <Route
          path="/organizations/join/:orgId"
          element={<LegacyPathRedirect toTemplate="/app/collaborate/join/:orgId" />}
        />
        <Route
          path="/organizations/:orgId/settings"
          element={<LegacyPathRedirect toTemplate="/app/collaborate/organizations/:orgId/settings" />}
        />
        <Route
          path="/workspaces/join/:orgId"
          element={<LegacyPathRedirect toTemplate="/app/collaborate/join/:orgId" />}
        />
        <Route
          path="/workspaces/:orgId/settings"
          element={<LegacyPathRedirect toTemplate="/app/collaborate/organizations/:orgId/settings" />}
        />
        <Route
          path="/w/:slug/*"
          element={
            <Protected>
              <LegacyWorkspaceRedirect />
            </Protected>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}

export default App;
