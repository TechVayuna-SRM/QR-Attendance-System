import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

// Existing pages
import Login from "./pages/Login";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import VerifyOTP from "./pages/VerifyOTP";
import Dashboard from "./pages/Dashboard";
import QRGenerate from "./pages/QRGenerate";
import QRScan from "./pages/QRScan";
import Analytics from "./pages/Analytics";
import FacultyAttendance from "./pages/FacultyAttendance";
import UserManagement from "./pages/UserManagement";

// New pages from Auth-and-Management
import OnboardingPage from "./pages/OnboardingPage";
import ProfilePage from "./pages/ProfilePage";
import EditProfilePage from "./pages/EditProfilePage";
import AdminPage from "./pages/AdminPage";
import DomainDashboardPage from "./pages/DomainDashboardPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          {/* Public auth routes */}
          <Route path="/login"         element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/verify-otp"    element={<VerifyOTP />} />

          {/* Onboarding — verified but not yet onboarded/approved */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarded={false}>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Protected — verified + onboarded + approved */}
          <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/scan"         element={<ProtectedRoute><QRScan /></ProtectedRoute>} />
          <Route path="/analytics"    element={<ProtectedRoute><Analytics /></ProtectedRoute>} />

          {/* Profile (new) */}
          <Route path="/profile"      element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />

          {/* Admin + Faculty only */}
          <Route
            path="/generate-qr"
            element={<ProtectedRoute roles={["admin", "faculty"]}><QRGenerate /></ProtectedRoute>}
          />
          <Route
            path="/users"
            element={<ProtectedRoute roles={["admin", "domain_lead", "faculty"]}><UserManagement /></ProtectedRoute>}
          />

          {/* Admin panel — admin + faculty */}
          <Route
            path="/admin"
            element={<ProtectedRoute roles={["admin", "faculty"]}><AdminPage /></ProtectedRoute>}
          />

          {/* Domain dashboard (new) */}
          <Route
            path="/domain/:domainId/dashboard"
            element={<ProtectedRoute><DomainDashboardPage /></ProtectedRoute>}
          />

          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>

        <img
          src="/phoenix.png"
          alt="Phoenix"
          style={{
            position: "fixed", bottom: "18px", right: "18px",
            width: "72px", height: "72px", objectFit: "contain",
            opacity: 0.85, zIndex: 9999, pointerEvents: "none",
            filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))"
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
