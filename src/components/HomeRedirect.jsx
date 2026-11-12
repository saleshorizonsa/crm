import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePageAccess } from "../contexts/PageAccessContext";

export const HomeRedirect = () => {
  const { userProfile, loading } = useAuth();
  // The landing page, or the first visible page when the admin hid it.
  const access = usePageAccess();

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

  // Every role's landing page lives in one place — viewer included — and a
  // page hidden for this user is skipped (utils/pageAccess.js).
  if (!access.ready) return null;
  return <Navigate to={access.landing} replace />;
};
