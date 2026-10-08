import React from "react";
import {
  BrowserRouter,
  Routes as RouterRoutes,
  Route,
  Navigate,
} from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";
import AIAssistant from "./components/AIAssistant";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomeRedirect } from "./components/HomeRedirect";
import { AuthProvider } from "./contexts/AuthContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { DateRangeProvider } from "./contexts/DateRangeContext";
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
import ReportsPage from "./pages/reports";
import CalendarPage from "./pages/calendar";
import PipelineView from "./pages/pipeline-view";
import PlanningPage from "./pages/planning";
import CoverageConsole from "./pages/coverage-console";
import SalesDivisions from "./pages/sales-divisions";
import {
  DIVISION_PAGE_ROLES,
  COVERAGE_CONSOLE_ROLES,
  DASHBOARD_ROLES,
  TARGETS_PAGE_ROLES,
} from "./utils/salesDivisionMetrics";
import TargetsPage from "./pages/targets";
import ReassignRecords from "./pages/reassign-records";
import NumbersCheck from "./pages/numbers-check";
// The roles the numbers check is for, imported from the page's own util so the
// route guard and the nav entry cannot drift from each other.
import { NUMBERS_CHECK_ROLES } from "./utils/numbersCheck";
import { REASSIGN_ROLES } from "./services/reassignmentService";

const Routes = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <LanguageProvider>
          <AuthProvider>
            <CurrencyProvider>
              <DateRangeProvider>
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
                    // Manager and above. Everything a salesman or a supervisor
                    // worked from here now lives on Insights, which is where
                    // this sends them — with the same one-line notice the
                    // Console uses, because an old bookmark is not a trespass.
                    <ProtectedRoute
                      allowedRoles={DASHBOARD_ROLES}
                      denyNotice="This page is not enabled for your account."
                    >
                      <CompanyDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/targets"
                  element={
                    <ProtectedRoute
                      allowedRoles={TARGETS_PAGE_ROLES}
                      denyNotice="This page is not enabled for your account."
                    >
                      <TargetsPage />
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
                  path="/calendar"
                  element={
                    <ProtectedRoute>
                      <CalendarPage />
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
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pipeline-view"
                  element={
                    <ProtectedRoute>
                      <PipelineView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/planning"
                  element={
                    <ProtectedRoute>
                      <PlanningPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/coverage-console"
                  element={
                    // Manager and above (CEO decision 2026-10-07): Insights
                    // answers the same question for a supervisor or a salesman,
                    // narrowed to their own scope. denyNotice sends anyone else
                    // to their landing page with one line of explanation rather
                    // than an Access Denied screen — an old bookmark is not a
                    // trespass. Same constant as the menu entry in Header.jsx.
                    <ProtectedRoute
                      allowedRoles={COVERAGE_CONSOLE_ROLES}
                      denyNotice="This page is not enabled for your account."
                    >
                      <CoverageConsole />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <ProtectedRoute allowedRoles={DIVISION_PAGE_ROLES}>
                      <SalesDivisions />
                    </ProtectedRoute>
                  }
                />
                {/* Admin/director only, enforced HERE as well as by hiding the
                    nav entry: a hidden link is not a permission. */}
                <Route
                  path="/numbers-check"
                  element={
                    <ProtectedRoute allowedRoles={NUMBERS_CHECK_ROLES}>
                      <NumbersCheck />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reassign-records"
                  element={
                    <ProtectedRoute allowedRoles={REASSIGN_ROLES}>
                      <ReassignRecords />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </RouterRoutes>
              <AIAssistant />
              </DateRangeProvider>
            </CurrencyProvider>
          </AuthProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
