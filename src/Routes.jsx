import React from "react";
import {
  BrowserRouter,
  Routes as RouterRoutes,
  Route,
  Navigate,
} from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomeRedirect } from "./components/HomeRedirect";
import { AuthProvider } from "./contexts/AuthContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { LanguageProvider } from "./i18n";
import NotFound from "./pages/NotFound";
import CompanyDashboard from "./pages/company-dashboard";
import Login from "./pages/login";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import AcceptInvitation from "./pages/accept-invitation";
import SalesPipeline from "./pages/sales-pipeline";
import ContactManagement from "./pages/contact-management";
import LeadManagement from "./pages/lead-management";
import TaskManagement from "./pages/task-management";
import UserManagement from "./pages/user-management";
import Settings from "./pages/settings";
import AccountSettings from "./pages/AccountSettings";
import AdminDashboard from "./pages/admin-dashboard";
import Notifications from "./pages/notifications";
import ForecastPage from "./pages/forecast";

const Routes = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <LanguageProvider>
          <AuthProvider>
            <CurrencyProvider>
              <ScrollToTop />
              <RouterRoutes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/accept-invitation" element={<AcceptInvitation />} />

                {/* Protected routes - Smart home redirect based on role */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <HomeRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/company-dashboard"
                  element={
                    <ProtectedRoute>
                      <CompanyDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sales-pipeline"
                  element={
                    <ProtectedRoute>
                      <SalesPipeline />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/lead-management"
                  element={
                    <ProtectedRoute>
                      <LeadManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contact-management"
                  element={
                    <ProtectedRoute>
                      <ContactManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/task-management"
                  element={
                    <ProtectedRoute>
                      <TaskManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/user-management"
                  element={
                    <ProtectedRoute>
                      <UserManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/account-settings"
                  element={
                    <ProtectedRoute>
                      <AccountSettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-dashboard"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <Notifications />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forecast"
                  element={
                    <ProtectedRoute>
                      <ForecastPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </RouterRoutes>
            </CurrencyProvider>
          </AuthProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
