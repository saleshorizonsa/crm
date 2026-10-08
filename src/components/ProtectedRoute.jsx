import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { capitalize } from "../utils/helper";
import { landingPathForRole } from "../utils/landingPath";
import RouteNotice from "./RouteNotice";

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-900"></div>
  </div>
);

// `requiredRole` admits exactly one role; `allowedRoles` admits any of several.
// When both are given, `allowedRoles` wins.
//
// `denyNotice` changes what a refusal LOOKS like. Without it, a role that may
// not open the route gets the Access Denied screen below — right for a page
// somebody reached by guessing a URL. With it, they are sent to their own
// landing page carrying that one line, which is right for a page the app simply
// does not offer their role: the Coverage Console stops at manager now, and a
// supervisor whose old bookmark points there should land somewhere useful with
// an explanation, not on a dead end that names roles at them.
export const ProtectedRoute = ({ children, requiredRole, allowedRoles, denyNotice }) => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    // REMEMBER WHERE THEY WERE GOING. Without this, following a notification
    // link to /planning#approvals while signed out sent you to the default
    // landing page after signing in, and the link was silently lost. The login
    // page prefers this over landingPathForRole.
    //
    // The whole location travels, not just the pathname, so a query string and
    // a hash (#approvals) survive too.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const restricted = Boolean(requiredRole || allowedRoles?.length);

  // Wait for userProfile to load before checking roles
  if (restricted && !userProfile) {
    return <Spinner />;
  }

  const permitted = allowedRoles?.length
    ? allowedRoles.includes(userProfile?.role)
    : userProfile?.role === requiredRole;

  // Viewers are confined to /pipeline-view — redirect any other path back.
  //
  // Carries the notice when the route they tried is one their role is not
  // offered, so a viewer opening the Console URL gets the same explanation a
  // supervisor does. A viewer wandering onto an unrestricted page is still
  // bounced silently: there is nothing to explain beyond the confinement
  // itself, which every other page would repeat.
  if (
    userProfile?.role === "viewer" &&
    location.pathname !== "/pipeline-view"
  ) {
    const explain = denyNotice && restricted && !permitted;
    return (
      <Navigate
        to="/pipeline-view"
        replace
        state={explain ? { notice: denyNotice } : undefined}
      />
    );
  }

  // NOT OFFERED, rather than forbidden: land them somewhere they can work, and
  // say why in one line. RouteNotice, rendered below on whichever route they
  // arrive at, is what shows it.
  if (restricted && !permitted && denyNotice) {
    return (
      <Navigate
        to={landingPathForRole(userProfile?.role)}
        replace
        state={{ notice: denyNotice }}
      />
    );
  }

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

  // The notice travels with the redirect and is shown wherever it landed, so it
  // is rendered here rather than by each landing page. It renders nothing at
  // all unless the current location carries one.
  return (
    <>
      <RouteNotice />
      {children}
    </>
  );
};
