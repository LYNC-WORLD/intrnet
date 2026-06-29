/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_JWT_KEY: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_SETTLEMENT_CURRENCY: string;
  readonly VITE_LOW_BALANCE_THRESHOLD: string;
  readonly VITE_AUTH0_DOMAIN: string;
  readonly VITE_AUTH0_CLIENT_ID: string;
  readonly VITE_AUTH0_AUDIENCE: string;
  readonly VITE_AUTH0_REDIRECT_URI: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}