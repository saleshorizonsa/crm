import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { capitalize } from "../utils/helper";

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-900"></div>
  </div>
);

// `requiredRole` admits exactly one role; `allowedRoles` admits any of several.
// When both are given, `allowedRoles` wins.
export const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Viewers are confined to /pipeline-view — redirect any other path back
  if (
    userProfile?.role === "viewer" &&
    location.pathname !== "/pipeline-view"
  ) {
    return <Navigate to="/pipeline-view" replace />;
  }

  const restricted = Boolean(requiredRole || allowedRoles?.length);

  // Wait for userProfile to load before checking roles
  if (restricted && !userProfile) {
    return <Spinner />;
  }

  const permitted = allowedRoles?.length
    ? allowedRoles.includes(userProfile?.role)
    : userProfile?.role === requiredRole;

  // Check role-based access if a role restriction is specified
  if (restricted && !permitted) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Required role: {allowedRoles?.length ? allowedRoles.join(", ") : requiredRole} | Your role:{" "}
            {userProfile?.role ? capitalize(userProfile.role) : "Unknown"}
          </p>
        </div>
      </div>
    );
  }

  return children;
};
