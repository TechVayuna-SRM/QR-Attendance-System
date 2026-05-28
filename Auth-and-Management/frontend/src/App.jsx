import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'

import LoginPage       from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import VerifyEmailPage  from './pages/VerifyEmailPage'
import ProfilePage      from './pages/ProfilePage'
import EditProfilePage  from './pages/EditProfilePage'
import AdminPage          from './pages/AdminPage'
import DomainDashboardPage from './pages/DomainDashboardPage'
import OnboardingPage   from './pages/OnboardingPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />

        <Routes>
          {/* Public */}
          <Route path="/"              element={<Navigate to="/profile" replace />} />
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* JWT required, verification NOT required (for OTP entry) */}
          <Route
            path="/verify-email"
            element={
              <ProtectedRoute requireOnboarded={false}>
                <VerifyEmailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireVerified requireOnboarded={false}>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* JWT + verified required */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute requireVerified>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute requireVerified>
                <EditProfilePage />
              </ProtectedRoute>
            }
          />

          {/* JWT + verified + admin role required */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireVerified requireRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />


          {/* Domain dashboard — accessible to admins and domain leads */}
          <Route
            path="/domain/:domainId/dashboard"
            element={
              <ProtectedRoute requireVerified>
                <DomainDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
