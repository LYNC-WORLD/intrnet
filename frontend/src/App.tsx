import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import {
  RequireAuth,
  RedirectIfAuth,
  RequireOnboarding,
} from "./components/layout/Guards";
import { useAuth0BridgeEffect } from "./hooks/useAuth0Bridge";

import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

import Dashboard from "./pages/company/Dashboard";
import Obligations from "./pages/company/Obligations";
import CreateObligation from "./pages/company/CreateObligation";
import ObligationDetail from "./pages/company/ObligationDetail";
import Cycles from "./pages/company/Cycles";
import CycleDetail from "./pages/company/CycleDetail";
import Positions from "./pages/company/Positions";
import Settlement from "./pages/company/Settlement";
import Account from "./pages/company/Account";

import Callback from "./pages/Callback";

/**
 * Mounted once, above the router's <Routes>, so the Auth0 -> backend token
 * exchange runs no matter which route the user lands on first (deep link,
 * refresh mid-session, etc) — not only when they happen to be on /login.
 */
function AuthBridgeMount() {
  useAuth0BridgeEffect();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthBridgeMount />
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <Login />
            </RedirectIfAuth>
          }
        />
        <Route path="/callback" element={<Callback />} />
        <Route
          path="/onboarding"
          element={
            <RequireOnboarding>
              <Onboarding />
            </RequireOnboarding>
          }
        />

        {/* Company (participant) */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/obligations"
          element={
            <RequireAuth>
              <Obligations />
            </RequireAuth>
          }
        />
        <Route
          path="/obligations/new"
          element={
            <RequireAuth>
              <CreateObligation />
            </RequireAuth>
          }
        />
        <Route
          path="/obligations/:contractId"
          element={
            <RequireAuth>
              <ObligationDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/cycles"
          element={
            <RequireAuth>
              <Cycles />
            </RequireAuth>
          }
        />
        <Route
          path="/cycles/:cycleId"
          element={
            <RequireAuth>
              <CycleDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/positions"
          element={
            <RequireAuth>
              <Positions />
            </RequireAuth>
          }
        />
        <Route
          path="/settlement"
          element={
            <RequireAuth>
              <Settlement />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <Account />
            </RequireAuth>
          }
        />

        {/* Default + fallback */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
