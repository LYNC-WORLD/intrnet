import { createContext, useContext, useState, ReactNode } from "react";
import { User } from "../types";

const JWT_KEY = import.meta.env.VITE_JWT_KEY || "nc_token";
const USER_KEY = "nc_user";

interface AuthContextType {
  /** Our backend's user record (role, status, companyName, etc). Null until oauthLogin succeeds. */
  user: User | null;
  /** Our backend's own JWT — this is what gets sent as Bearer on every API call. NOT the Auth0 token. */
  token: string | null;
  /** Stores the backend session after a successful /api/auth/oauth/login exchange. */
  setSession: (token: string, user: User) => void;
  /** Updates the cached user record in place (e.g. after onboarding changes status). */
  updateUser: (patch: Partial<User>) => void;
  /** Clears our backend session. Does not touch Auth0's own session — call auth0's logout() separately. */
  clearSession: () => void;
  isAuthenticated: boolean;
  /**
   * Shared status of the single, app-level Auth0 -> backend exchange (see
   * useAuth0Bridge, mounted once in App.tsx). Pages like Login read these
   * instead of running their own copy of the exchange.
   */
  exchanging: boolean;
  exchangeError: string | null;
  setExchangeStatus: (state: {
    exchanging: boolean;
    error: string | null;
  }) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(JWT_KEY),
  );
  const [user, setUser] = useState<User | null>(() => {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [exchanging, setExchanging] = useState(false);
  const [exchangeError, setExchangeErrorState] = useState<string | null>(null);

  const setSession = (t: string, u: User) => {
    localStorage.setItem(JWT_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const updateUser = (patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearSession = () => {
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  const setExchangeStatus = ({
    exchanging: ex,
    error,
  }: {
    exchanging: boolean;
    error: string | null;
  }) => {
    setExchanging(ex);
    setExchangeErrorState(error);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        setSession,
        updateUser,
        clearSession,
        isAuthenticated: !!token,
        exchanging,
        exchangeError,
        setExchangeStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
