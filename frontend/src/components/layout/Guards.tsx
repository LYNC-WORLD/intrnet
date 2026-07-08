import { Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useAuth } from "../../context/AuthContext";
import { ReactNode } from "react";
import Shell from "./Shell";
import { PendingApprovalGate } from "../ui/PendingApprovalGate";
import { PageLoader } from "../ui";

function useIsBridging() {
  const { isAuthenticated: auth0Authenticated, isLoading: auth0Loading } =
    useAuth0();
  const {
    isAuthenticated: hasBackendSession,
    exchanging,
    exchangeError,
  } = useAuth();
  if (exchangeError) return false;
  return (
    auth0Loading || (auth0Authenticated && !hasBackendSession && exchanging)
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const bridging = useIsBridging();
  if (bridging) return <PageLoader />;
  if (!isAuthenticated)
    return <Navigate to="/login" state={{ from: location }} replace />;
  if (user?.status === "PENDING")
    return <PendingApprovalGate companyName={user.companyName ?? ""} />;
  return <Shell>{children}</Shell>;
}

export function RedirectIfAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const bridging = useIsBridging();
  if (bridging) return <PageLoader />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { isAuthenticated: auth0Authenticated, isLoading: auth0Loading } =
    useAuth0();
  if (auth0Loading) return <PageLoader />;
  if (!auth0Authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
