import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const HomeRedirect = () => {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-4"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    );
  }

  // Redirect based on role
  if (userProfile?.role === "admin") {
    return <Navigate to="/admin-dashboard" replace />;
  }

  // Default to company dashboard for all other roles
  return <Navigate to="/company-dashboard" replace />;
};
