// src/hooks/useAuth.tsx - VERSÃO FINAL CORRIGIDA
import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { api } from "../services/api";
// ✅ Imports do Firebase vêm do arquivo separado
import { auth, googleProvider, signInWithPopup } from "../firebaseConfig";
// ✅ Import do useToast original para evitar conflito com wrapper
import { useToast as useOriginalToast } from "../components/ui/use-toast";

// ==========================================
// ✅ CACHE DE PROFILE (FORA DO COMPONENTE)
// ==========================================
let profileCache: any | null = null;
let profileCacheTimestamp: number = 0;
const PROFILE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos

function isProfileCacheValid(): boolean {
  return profileCache !== null && (Date.now() - profileCacheTimestamp) < PROFILE_CACHE_DURATION;
}

let activeProfileRequest: Promise<any> | null = null;

const optimizedProfileApi = {
  get: async (forceRefresh = false): Promise<any> => {
    if (activeProfileRequest && !forceRefresh) return activeProfileRequest;
    if (!forceRefresh && isProfileCacheValid()) return Promise.resolve(profileCache!);
    
    activeProfileRequest = (async () => {
      try {
        const response = await api.get('/profile/', { timeout: 30000 }); // ✅ Aumentado para 30s
        const data = response.data;
        profileCache = data;
        profileCacheTimestamp = Date.now();
        return data;
      } catch (error: any) {
        if (profileCache && !forceRefresh && error.response?.status !== 401) {
          return profileCache;
        }
        throw error;
      } finally {
        activeProfileRequest = null;
      }
    })();
    return activeProfileRequest;
  },
  clearCache: () => {
    profileCache = null;
    profileCacheTimestamp = 0;
    activeProfileRequest = null;
  }
};

// ==========================================
// ✅ INTERFACES
// ==========================================
export interface User {
  id: number;
  email: string;
  name?: string;
  display_name?: string;
  store_name?: string;
  plan?: string;
  whatsapp_number?: string;
  store_slug?: string;
  storefront_enabled?: boolean;
  has_store?: boolean;
  can_add_products?: boolean;
  is_staff?: boolean;
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  authLoading?: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

// ==========================================
// ✅ PROVIDER
// ==========================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  // ✅ Usar toast original para evitar conflito com wrapper
  const { toast: originalToast } = useOriginalToast();
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const initRef = useRef(false);

  // ==========================================
  // ✅ RENOVAR TOKEN
  // ==========================================
  const refreshToken = async (): Promise<string | null> => {
    const storedRefreshToken = localStorage.getItem("refresh_token");
    if (!storedRefreshToken) return null;

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/api/auth/token/refresh/`,
        { refresh: storedRefreshToken },
        { timeout: 10000 }
      );
      const newAccessToken = response.data.access;
      localStorage.setItem("auth_token", newAccessToken);
      api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
      return newAccessToken;
    } catch (error) {
      console.warn("❌ Falha ao renovar token");
      return null;
    }
  };

  // ==========================================
  // ✅ LOGOUT
  // ==========================================
  const handleLogout = useCallback((shouldNavigate = true) => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    delete api.defaults.headers.common["Authorization"];
    optimizedProfileApi.clearCache();
    setUser(null);
    setIsInitialized(false);
    initRef.current = false;
    
    if (shouldNavigate && window.location.pathname !== '/auth') {
      navigate("/auth", { replace: true });
    }
  }, [navigate]);
// src/hooks/useAuth.tsx - initializeAuth CORRIGIDO

const initializeAuth = useCallback(async () => {
  // ✅ Guard 1: Prevenir execução múltipla (race condition)
  if (initRef.current) {
    if (import.meta.env.DEV) console.log("⏳ initializeAuth já está rodando, ignorando...");
    return;
  }
  
  initRef.current = true;
  
  if (import.meta.env.DEV) console.log("[DEBUG] initializeAuth iniciado");

  const storedToken = localStorage.getItem("auth_token");
  const storedUser = localStorage.getItem("auth_user");
  
  // ✅ Guard 2: Se não tem token, NÃO tentar carregar profile
  if (!storedToken) {
    console.log("🔐 initializeAuth: Sem token, usuário não autenticado");
    setUser(null);
    setLoading(false);
    setIsInitialized(true);
    initRef.current = false;
    return;
  }

  // ✅ Configurar header global para requisições futuras
  api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
  
  // ✅ Carregar usuário do localStorage (dados otimistas)
  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (import.meta.env.DEV) console.log("📦 User carregado do localStorage:", parsedUser.email);
    } catch (e) {
      console.warn("⚠️ Erro ao parsear auth_user, limpando...");
      localStorage.removeItem("auth_user");
    }
  }

  try {
    let profileData = null;
    
    // ✅ Tentar carregar profile do backend
    try {
      if (import.meta.env.DEV) console.log("🔄 Buscando profile do backend...");
      profileData = await optimizedProfileApi.get();
    } catch (err: any) {
      // ✅ Tratamento de erro 401: tentar renovar token
      if (err.response?.status === 401) {
        if (import.meta.env.DEV) console.log("🔄 Token expirado. Tentando renovar...");
        const newToken = await refreshToken();
        
        if (newToken) {
          // ✅ Retry com token renovado
          profileData = await optimizedProfileApi.get(true);
          if (import.meta.env.DEV) console.log("✅ Token renovado com sucesso");
        } else {
          // ✅ Renovação falhou: limpar sessão
          if (import.meta.env.DEV) console.warn("🔒 Renovação falhou. Limpando sessão...");
          handleLogout(false);
          setLoading(false);
          setIsInitialized(true);
          initRef.current = false;
          return;
        }
      } else {
        // ✅ Erro de rede ou outro: log e continua com dados locais
        if (import.meta.env.DEV) console.warn("⚠️ Erro ao carregar profile:", err.message);
      }
    }

    // ✅ Se recebeu dados do profile, atualizar estado
    if (profileData) {
      const userData: User = {
        ...(storedUser ? JSON.parse(storedUser) : {}),
        ...profileData,
        id: profileData.id || 0,
        email: profileData.email || '',  // ✅ Email é CRÍTICO para gatilho de consentimento
        name: profileData.display_name || profileData.name || '',
        is_staff: profileData.is_staff ?? false
      };
      
      setUser(userData);
      localStorage.setItem("auth_user", JSON.stringify(userData));
      
      // ✅ Log de debug: profile carregado (gatilho para useConsentCheck)
      console.log("✅ Profile loaded:", userData.email);
      
      // ✅ Guard extra: se email não veio do backend, não disparar consentimento
      if (!userData.email) {
        console.warn("⚠️ Profile sem email, consentimento não será verificado");
      }
    }

  } catch (error: any) {
    // ✅ Erro crítico na inicialização
    if (import.meta.env.DEV) console.error("❌ Erro na inicialização:", {
      message: error?.message,
      status: error?.response?.status,
      stack: error?.stack,
    });
    
    // ✅ Em caso de erro, limpar sessão para evitar estado inconsistente
    handleLogout(false);
  } finally {
    // ✅ Sempre finalizar loading e marcar como inicializado
    setLoading(false);
    setIsInitialized(true);
    initRef.current = false;
    
    if (import.meta.env.DEV) console.log("[DEBUG] initializeAuth finalizado", {
      loading: false,
      isInitialized: true,
      user: user?.email || null,
    });
  }
}, [handleLogout]); // ✅ Dependencies mínimas para evitar re-criação

// ✅ Efeito que dispara initializeAuth apenas uma vez
useEffect(() => {
  // ✅ Só executar se:
  // 1. Ainda não foi inicializado
  // 2. Não está em execução (previne race condition)
  if (!isInitialized && !initRef.current) {
    initializeAuth();
  }
}, [isInitialized, initializeAuth]); // ✅ initializeAuth está no useCallback, então é estável
  // ==========================================
  // ✅ LOGIN (Email/Senha)
  // ==========================================
  const signIn = async (email: string, password: string) => {
    setAuthLoading(true);
    
    try {
      const response = await api.post("/auth/login/", { email, password });
      const { access, refresh, consent_required } = response.data;
      
      if (!access) throw new Error("Token não recebido");
      
      const hasBasicConsent = localStorage.getItem("cookie_consent_accepted") === "true";
      if (!hasBasicConsent) {
        navigate("/consent", { state: { from: location } });
        return;
      }
      
      if (consent_required) {
        console.log("✅ Consentimento completo pendente");
      }
      
      localStorage.setItem("auth_token", access);
      if (refresh) localStorage.setItem("refresh_token", refresh);
      api.defaults.headers.common["Authorization"] = `Bearer ${access}`;
      
      try {
        const profileData = await optimizedProfileApi.get(true);
        const userData: User = {
          id: profileData.id || 0,
          email: profileData.email || email,
          name: profileData.display_name || profileData.name || email.split('@')[0],
          ...profileData,
          is_staff: profileData.is_staff ?? false
        };
        localStorage.setItem("auth_user", JSON.stringify(userData));
        setUser(userData);
        console.log("✅ Login completo:", userData.email);
      } catch (e) {
        setUser({ id: 0, email, name: email.split('@')[0], is_staff: false });
      }
      
    } catch (error: any) {
      console.error("❌ Erro no login:", error);
      
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        originalToast({
          title: "⏳ Servidor respondendo lentamente",
          description: "Tente novamente em alguns instantes.",
          variant: "destructive",
        });
      } else {
        originalToast({
          title: "❌ Erro no login",
          description: error.message || "Credenciais inválidas",
          variant: "destructive",
        });
      }
      
      handleLogout(false);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    setAuthLoading(true);
    try {
      await api.post("/auth/register/", { email, password, name });
    } finally {
      setAuthLoading(false);
    }
  };

  // ==========================================
  // ✅ LOGIN GOOGLE
  // ==========================================
  const signInWithGoogle = async () => {
    setAuthLoading(true);
    
    try {
      console.log("🔐 Iniciando login com Google...");
      
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      
      console.log("🔐 Enviando token para backend...", { 
        tokenLength: idToken?.length,
        timestamp: Date.now()
      });

      // ✅ Debug logs (remover em produção se desejar)
      console.log("🔍 [CP1] Preparando requisição Firebase login");
      console.log("🔍 [CP1] VITE_API_BASE_URL:", import.meta.env.VITE_API_BASE_URL);
      console.log("🔍 [CP1] URL completa:", `${import.meta.env.VITE_API_BASE_URL}/api/auth/firebase/`);
      console.log("🔍 [CP1] idToken length:", idToken?.length);
      console.log("🔍 [CP1] idToken starts with:", idToken?.substring(0, 20) + "...");

      // Verificar se há token JWT antigo no localStorage (pode causar conflito)
      const oldToken = localStorage.getItem("auth_token");
      console.log("🔍 [CP1] auth_token no localStorage:", oldToken ? "✅ Existe" : "❌ Não existe");
      if (oldToken) {
        console.log("⚠️ [CP1] ATENÇÃO: Token antigo pode interferir. Limpando...");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("refresh_token");
        delete api.defaults.headers.common["Authorization"];
      }

      // ✅ Usar fetch direto para evitar conflito com ApiKeyMiddleware
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/firebase/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ✅ NÃO enviar Authorization - é auth de usuário, não API Key
        },
        body: JSON.stringify({ token: idToken }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }
      
      const data = await response.json();
      const { access, refresh } = data;
      
      if (!access) throw new Error("Token Django ausente");

      localStorage.setItem("auth_token", access);
      if (refresh) localStorage.setItem("refresh_token", refresh);
      api.defaults.headers.common["Authorization"] = `Bearer ${access}`;
      
      console.log("✅ Token JWT salvo:", { 
        accessStart: access.substring(0, 20) + "...",
        hasRefresh: !!refresh 
      });

      // ✅ Carregar profile APÓS salvar token (gatilho para consentimento)
      try {
        const profileData = await optimizedProfileApi.get(true);
        const userData: User = {
          id: profileData.id || 0,
          email: profileData.email || result.user.email || "",
          name: profileData.display_name || result.user.displayName || "",
          ...profileData,
          is_staff: profileData.is_staff ?? false
        };
        localStorage.setItem("auth_user", JSON.stringify(userData));
        setUser(userData);
        console.log("✅ Login completo, profile carregado:", userData.email);
      } catch (e) {
        console.warn("⚠️ Perfil não carregado, usando dados básicos");
        setUser({
          id: 0,
          email: result.user.email || "",
          name: result.user.displayName || "",
          is_staff: false
        });
      }
      
    } catch (error: any) {
      console.error("❌ Erro Google Sign-In:", {
        message: error.message,
        code: error.code,
      });

      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        originalToast({
          title: "⏳ Conexão lenta",
          description: "O servidor está respondendo lentamente. Tente novamente.",
          variant: "destructive",
        });
      } else if (error.message?.includes("popup-blocked")) {
        originalToast({
          title: "Popup bloqueado",
          description: "Permita popups para este site e tente novamente",
          variant: "destructive",
        });
      } else if (error.message?.includes("cancelado") || error.code === "auth/popup-closed-by-user") {
        return;
      } else if (error.code === "auth/account-exists-with-different-credential") {
        originalToast({
          title: "Conta já existe",
          description: "Este email já está vinculado a outro método de login",
          variant: "destructive",
        });
      } else {
        originalToast({
          title: "Erro no login",
          description: error.message || "Tente novamente",
          variant: "destructive",
        });
      }

      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signInDemo = () => {
    const demoUser: User = { 
      id: 999, 
      email: "demo@natura.com", 
      name: "Consultora Teste", 
      plan: "FREE",
      is_staff: false
    };
    setUser(demoUser);
    localStorage.setItem("auth_user", JSON.stringify(demoUser));
    localStorage.setItem("auth_token", "demo_token_123");
    api.defaults.headers.common["Authorization"] = `Bearer demo_token_123`;
  };

  const signOut = async () => {
    await auth.signOut().catch(() => {});
    handleLogout(true);
  };

  const refreshProfile = async () => {
    try {
      const profileData = await optimizedProfileApi.get(true);
      const updatedUser: User = { ...user, ...profileData, is_staff: profileData.is_staff ?? user?.is_staff ?? false };
      setUser(updatedUser);
      localStorage.setItem("auth_user", JSON.stringify(updatedUser));
    } catch (error) {
      console.error("❌ Erro ao atualizar profile:", error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, 
      loading, 
      authLoading,
      signIn, 
      signUp, 
      signInWithGoogle, 
      signInDemo, 
      signOut,
      isAuthenticated: !!user, 
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
};
// ✅ FIM DO ARQUIVO - Não adicionar nada após esta linha