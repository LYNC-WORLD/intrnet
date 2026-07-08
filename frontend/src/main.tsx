import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Auth0Provider, AppState } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const redirectUri = window.location.origin + "/callback";

function Auth0ProviderWithNavigate({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  const onRedirectCallback = (_appState?: AppState) => {};

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience,
      }}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      {children}
    </Auth0Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Auth0ProviderWithNavigate>
        <App />
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </React.StrictMode>,
);
