import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-900"></div>
  </div>
);

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for userProfile to load before checking roles
  if (requiredRole && !userProfile) {
    return <Spinner />;
  }

  // Check role-based access if requiredRole is specified
  if (requiredRole && userProfile?.role !== requiredRole) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Required role: {requiredRole} | Your role:{" "}
            {userProfile?.role ? capitalize(userProfile.role) : "Unknown"}
          </p>
        </div>
      </div>
    );
  }

  return children;
};
