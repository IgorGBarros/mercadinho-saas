// lib/devApi.ts
//
// Cliente HTTP separado do resto do sistema, de propósito — o token do
// desenvolvedor nunca deve se misturar com o da consultora. Guardado numa
// chave de localStorage diferente, pra funcionar até no mesmo navegador
// onde alguém também está logada como consultora.
const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || "https://dev-brih.onrender.com")
  .replace(/\/$/, "") + "/api";

const TOKEN_KEY = "dev_access_token";
const REFRESH_KEY = "dev_refresh_token";

export function getDevToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setDevTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearDevTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isDevLoggedIn(): boolean {
  return !!getDevToken();
}

async function devRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getDevToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `Erro ${response.status}`);
  }
  // 204 No Content não tem corpo pra parsear
  if (response.status === 204) return undefined as T;
  return response.json();
}

export interface DeveloperAccount {
  id: string;
  email: string;
  name: string;
  company_name: string;
  created_at: string;
  last_login_at: string | null;
}

export interface DevApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  plan: string;
  scopes: string[];
  rate_limit: number;
  monthly_quota: number;
  is_active: boolean;
  last_used: string | null;
}

export interface DevDashboardData {
  keys: DevApiKeySummary[];
  requests_this_month: number;
  error_rate_percent: number;
  success_rate_percent: number;
  avg_latency_ms: number;
  quota_used: number;
  quota_limit: number;
  requests_by_day: { date: string; count: number }[];
}

export const devApi = {
  register: (data: { email: string; password: string; name: string; company_name?: string }) =>
    devRequest<{ developer: DeveloperAccount; api_key: string; api_key_warning: string; access: string; refresh: string }>(
      "/developers/register/",
      { method: "POST", body: JSON.stringify(data) }
    ),

  login: (data: { email: string; password: string }) =>
    devRequest<{ developer: DeveloperAccount; access: string; refresh: string }>(
      "/developers/login/",
      { method: "POST", body: JSON.stringify(data) }
    ),

  // 🔑 Login social (Google/GitHub) — o token já vem verificado pelo popup
  // do Firebase no navegador; o backend confirma de novo com o Admin SDK
  // antes de criar/logar a conta.
  firebaseLogin: (firebaseToken: string) =>
    devRequest<{ developer: DeveloperAccount; created: boolean; access: string; refresh: string }>(
      "/developers/firebase-login/",
      { method: "POST", body: JSON.stringify({ token: firebaseToken }) }
    ),

  me: () => devRequest<{ developer: DeveloperAccount; api_keys: DevApiKeySummary[] }>("/developers/me/"),

  dashboard: () => devRequest<DevDashboardData>("/developers/dashboard/"),

  // 💰 Fase 4 — gera o link de pagamento pra assinar um plano pago.
  checkout: (data: { plan_type: "starter" | "pro" | "enterprise"; billing_cycle: "monthly" | "yearly" }) =>
    devRequest<{ checkout_url: string; payment_link_id: string; plan_type: string; billing_cycle: string }>(
      "/developers/checkout/",
      { method: "POST", body: JSON.stringify(data) }
    ),
};