// src/services/api.ts - CONFIGURAÇÃO BASE OTIMIZADA + LGPD FIX
import axios, { AxiosError, AxiosRequestHeaders, InternalAxiosRequestConfig } from "axios";

// ✅ Base URL com fallback seguro
const rawBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "https://dev-brih.onrender.com";
const finalBaseUrl = rawBaseUrl.replace(/\/$/, "") + "/api";

// 🔐 Helpers de Token
export function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setToken(token: string) {
  localStorage.setItem("auth_token", token);
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}

export function clearToken() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("auth_user");
  delete api.defaults.headers.common["Authorization"];
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

export function setRefreshToken(token: string) {
  localStorage.setItem("refresh_token", token);
}

// ⚠️ Renovação automática do token de acesso.
// O access token dura 60 minutos; o refresh dura 7 dias. Antes, qualquer 401
// limpava a sessão e mandava a pessoa para /auth — ou seja, depois de 1 hora
// de uso a consultora era DESLOGADA no meio do trabalho, sem ter pedido.
// Agora tentamos renovar com o refresh token e repetir a requisição; só
// deslogamos se a renovação também falhar (refresh expirado ou revogado).
let refreshEmAndamento: Promise<string | null> | null = null;

async function renovarToken(): Promise<string | null> {
  // Se já existe uma renovação em curso, todas as requisições que falharam
  // ao mesmo tempo aguardam a MESMA renovação (evita várias chamadas e o
  // consumo indevido do refresh token, que é rotacionado a cada uso).
  if (refreshEmAndamento) return refreshEmAndamento;

  const refresh = getRefreshToken();
  if (!refresh) return null;

  refreshEmAndamento = (async () => {
    try {
      // axios "cru" de propósito: usar a instância `api` dispararia os
      // interceptors de novo e criaria recursão.
      const resp = await axios.post(`${finalBaseUrl}/auth/refresh/`, { refresh });
      const novoAccess = resp.data?.access;
      if (!novoAccess) return null;

      setToken(novoAccess);
      // ROTATE_REFRESH_TOKENS=True: o servidor devolve um refresh novo e
      // invalida o anterior (blacklist). Precisamos guardar o novo.
      if (resp.data?.refresh) setRefreshToken(resp.data.refresh);
      return novoAccess;
    } catch {
      return null;
    } finally {
      refreshEmAndamento = null;
    }
  })();

  return refreshEmAndamento;
}

// 🚀 Instância principal do Axios
export const api = axios.create({
  baseURL: finalBaseUrl,
  headers: { 
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  timeout: 60000, // ✅ 60 segundos para cold starts do Render
});

// ==========================================
// ✅ LISTAS DE ROTAS - CRÍTICO PARA LGPD
// ==========================================

// 🔓 Rotas VERDADEIRAMENTE públicas (NÃO recebem JWT)
const PUBLIC_ROUTES = [
  '/auth/login/',
  '/auth/register/',
  '/auth/firebase/',      // ← Firebase auth usa token próprio
  '/auth/refresh/',
  '/public/',
  '/vitrine/',
  '/theme/',
  '/health/',
  '/products/lookup/',
  '/schema/',
  '/docs/',
  '/redoc/',
  // ✅ REMOVIDO: '/consent/' - rotas de consentimento usam JWT!
];

// 🔐 Rotas de consentimento que DEVEM receber JWT (usuário autenticado)
// Estas NÃO estão em PUBLIC_ROUTES, então recebem token automaticamente
const CONSENT_PROTECTED_ROUTES = [
  '/consent/my/',         // ← Lista consentimentos do usuário (REQUER JWT)
  '/consent/revoke/',     // ← Revoga consentimento (REQUER JWT)
  '/consent/export/',     // ← Exporta dados (REQUER JWT)
];

// 🔁 Interceptador REQUEST - LÓGICA CORRIGIDA
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    const url = config.url || '';
    const method = config.method?.toLowerCase();
    
    // ✅ Verificar tipo de rota
    const isPublicRoute = PUBLIC_ROUTES.some(route => url.includes(route));
    
    // ✅ Caso especial: POST /consent/ pode ser público, mas GET/DELETE requerem JWT
    const isConsentPublicPost = url.includes('/consent/') && method === 'post' && !url.includes('/my/') && !url.includes('/revoke/');
    
    // ✅ Só injetar token JWT se:
    // 1. Token existe
    // 2. NÃO é rota pública
    // 3. NÃO é POST público de consentimento
    // 4. Header ainda não foi definido
    if (token && !isPublicRoute && !isConsentPublicPost && !config.headers["Authorization"]) {
      config.headers["Authorization"] = `Bearer ${token}`;
      if (import.meta.env.DEV) {
        console.log(`✅ JWT injetado em ${method?.toUpperCase()} ${url}`);
      }
    } else if (import.meta.env.DEV) {
      const reason = isPublicRoute ? 'rota pública' : isConsentPublicPost ? 'POST consent público' : 'sem token';
      console.log(`🔍 ${reason}: ${method?.toUpperCase()} ${url}`);
    }
    
    return config;
  },
  (error: AxiosError) => {
    if (import.meta.env.DEV) {
      console.error("❌ Request Error:", error);
    }
    return Promise.reject(error);
  }
);

// 🚨 Interceptador RESPONSE
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`✅ ${response.status} ${response.config.url}`);
    }
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    
    // ✅ Log de erro apenas em desenvolvimento
    if (import.meta.env.DEV) {
      console.error(`❌ ${status} ${url}`, {
        message: error.message,
        data: error.response?.data,
      });
    }
    
    // ✅ Tratamento de erro 401 (token expirado/inválido)
    if (status === 401) {
      const isAuthRoute = url.includes('/auth/');
      const isConsentRoute = url.includes('/consent/');
      const original = error.config as (InternalAxiosRequestConfig & { _jaTentouRenovar?: boolean }) | undefined;

      if (!isAuthRoute && !isConsentRoute && getToken()) {
        // 1ª tentativa: renovar o token e repetir a requisição original.
        // A flag evita laço infinito caso o request renovado falhe de novo.
        if (original && !original._jaTentouRenovar) {
          original._jaTentouRenovar = true;
          const novoToken = await renovarToken();

          if (novoToken) {
            original.headers = original.headers || ({} as AxiosRequestHeaders);
            (original.headers as any).Authorization = `Bearer ${novoToken}`;
            return api.request(original);
          }
        }

        // Renovação falhou (refresh expirado/revogado): aí sim encerra.
        console.warn("🔒 Sessão expirada. Faça login novamente.");
        clearToken();

        if (!window.location.pathname.includes('/auth')) {
          setTimeout(() => {
            window.location.href = '/auth';
          }, 100);
        }
      }
    }
    
    // ✅ Tratamento de erro 403 (proibido - pode ser consentimento pendente)
    if (status === 403) {
      const data = error.response?.data as any;
      if (data?.action_required === 'accept_consent') {
        console.log("🔐 Consentimento necessário");
        // Emitir evento para frontend mostrar modal
        window.dispatchEvent(new CustomEvent('consent-required'));
      }
    }
    
    // ✅ Tratamento de erro 404
    if (status === 404 && import.meta.env.DEV) {
      console.warn(`⚠️ Endpoint não encontrado: ${url}`);
    }
    
    // ✅ Tratamento de timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn(`⏳ Timeout na requisição para ${url}`);
    }
    
    return Promise.reject(error);
  }
);

// ✅ Inicialização: Carrega token salvo ao iniciar
const initializeApi = () => {
  const token = getToken();
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    if (import.meta.env.DEV) {
      console.log("🔐 Token JWT carregado do localStorage");
    }
  }
};

if (typeof window !== 'undefined') {
  initializeApi();
}

export default api;