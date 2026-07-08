import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

let exchangeInFlight = false;
let exchangeDone = false;
let exchangeFailed = false;

export function useAuth0BridgeEffect() {
  const {
    isAuthenticated: auth0Authenticated,
    isLoading: auth0Loading,
    getAccessTokenSilently,
  } = useAuth0();
  const { setSession, setExchangeStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth0Loading || !auth0Authenticated) return;
    if (exchangeInFlight || exchangeDone || exchangeFailed) return;

    exchangeInFlight = true;
    setExchangeStatus({ exchanging: true, error: null });

    (async () => {
      try {
        const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
        const auth0Token = await getAccessTokenSilently({
          authorizationParams: { audience },
        });

        const res = await authApi.oauthLogin(auth0Token);
        const { user } = res.data;

        exchangeDone = true;
        setExchangeStatus({ exchanging: false, error: null });

        if (!user.onboardingState) {
          navigate("/onboarding", {
            replace: true,
            state: { pendingUser: user },
          });
          return;
        }

        setSession(auth0Token, user);

        navigate("/dashboard", { replace: true });
      } catch (err) {
        console.error("EXCHANGE ERROR:", err);
        exchangeInFlight = false;
        exchangeFailed = true;
        setExchangeStatus({
          exchanging: false,
          error: "Sign-in failed. Please try again.",
        });
        toast.error("Sign-in failed. Please try again.");
        navigate("/login", { replace: true });
      }
    })();
  }, [
    auth0Authenticated,
    auth0Loading,
    getAccessTokenSilently,
    setSession,
    setExchangeStatus,
    navigate,
  ]);
}

export function useAuth0Bridge() {
  const {
    isAuthenticated: auth0Authenticated,
    isLoading: auth0Loading,
    error: auth0Error,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();
  const { exchanging, exchangeError } = useAuth();

  const loginWithGoogle = () => {
    exchangeFailed = false;
    loginWithRedirect();
  };

  const fullLogout = () => {
    exchangeDone = false;
    exchangeInFlight = false;
    exchangeFailed = false;
    auth0Logout({
      logoutParams: { returnTo: window.location.origin + "/login" },
    });
  };

  return {
    loginWithGoogle,
    fullLogout,
    exchanging: exchanging || (auth0Authenticated && auth0Loading),
    error: auth0Error?.message ?? exchangeError,
  };
}
