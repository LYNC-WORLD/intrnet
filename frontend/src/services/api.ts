import axios, { AxiosInstance, AxiosError } from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const JWT_KEY = "nc_token";

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(JWT_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (
      res.data &&
      typeof res.data === "object" &&
      "success" in res.data &&
      "data" in res.data
    ) {
      res.data = res.data.data;
    }
    return res;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(JWT_KEY);
      localStorage.removeItem("nc_user");
      window.location.href = "/login?expired=1";
    }
    return Promise.reject(error);
  },
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),
  register: (body: {
    companyName: string;
    email: string;
    password: string;
    country: string;
  }) => api.post("/api/auth/register", body),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/api/auth/change-password", { currentPassword, newPassword }),
  me: () => api.get("/api/auth/me"),
  /** Exchange an Auth0 access token for our own backend session token. */
  oauthLogin: (auth0Token: string) =>
    api.post("/api/auth/oauth/login", { token: auth0Token }),
};

// ─── Onboarding ──────────────────────────────────────────────────────────────
export const onboardingApi = {
  submit: (
    body: {
      email: string;
      companyName: string;
      contactName: string;
      phone: string;
      country: string;
      partyHint: string;
    },
    auth0Token: string,
  ) =>
    api.post("/api/onboarding/submit", body, {
      headers: { Authorization: `Bearer ${auth0Token}` },
    }),
};

// ─── Obligations ─────────────────────────────────────────────────────────────
export const obligationsApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get("/api/obligations", { params }),
  create: (body: Record<string, unknown>) => api.post("/api/obligations", body),
  get: (cid: string) => api.get(`/api/obligations/${cid}`),
  accept: (cid: string) => api.post(`/api/obligations/${cid}/accept`, {}),
  reject: (cid: string, reason: string) =>
    api.post(`/api/obligations/${cid}/reject`, { reason }),
};

// ─── Participants ─────────────────────────────────────────────────────────────
export const participantsApi = {
  list: () => api.get("/api/participants"),
  agreement: () => api.get("/api/agreement"),
};

// ─── FX Rates ─────────────────────────────────────────────────────────────────
export const fxApi = {
  list: () => api.get("/api/fx-rates"),
  history: (params?: Record<string, string | number>) =>
    api.get("/api/fx-rates/history", { params }),
  update: (cid: string, newRate: number) =>
    api.put(`/api/fx-rates/${cid}`, { newRate }),
  create: (body: { fromCurrency: string; toCurrency: string; rate: number }) =>
    api.post("/api/fx-rates", body),
  refresh: () => api.post("/api/fx-rates/refresh", {}),
};

// ─── Cycles ──────────────────────────────────────────────────────────────────
export const cyclesApi = {
  list: () => api.get("/api/cycles"),
  create: (body: {
    cycleId: string;
    cutoffTime: string;
    agreementContractId: string;
  }) => api.post("/api/cycles", body),
  get: (cid: string) => api.get(`/api/cycles/${cid}`),
  addObligations: (cid: string) =>
    api.post(`/api/cycles/${cid}/add-obligations`, {}),
  addSingleObligation: (cid: string, obligationContractId: string) =>
    api.post(`/api/cycles/${cid}/add-single`, { obligationContractId }),
  compute: (cid: string) => api.post(`/api/cycles/${cid}/compute`, {}),
  settle: (cid: string) => api.post(`/api/cycles/${cid}/settle`, {}),
  close: (cid: string) => api.post(`/api/cycles/${cid}/close`, {}),
};

// ─── Positions ────────────────────────────────────────────────────────────────
export const positionsApi = {
  list: (params?: Record<string, string>) =>
    api.get("/api/positions", { params }),
  acknowledge: (cid: string) =>
    api.post(`/api/positions/${cid}/acknowledge`, {}),
};

// ─── Settlement ──────────────────────────────────────────────────────────────
export const settlementApi = {
  instructions: (params?: Record<string, string>) =>
    api.get("/api/settlement/instructions", { params }),
  execute: (cid: string) =>
    api.post(`/api/settlement/instructions/${cid}/execute`, {}),
  confirm: (cid: string) =>
    api.post(`/api/settlement/instructions/${cid}/confirm`, {}),
  accounts: (params?: Record<string, string>) =>
    api.get("/api/settlement/accounts", { params }),
};
