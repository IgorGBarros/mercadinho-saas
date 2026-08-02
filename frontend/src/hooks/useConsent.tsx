// src/hooks/useConsent.ts
import { useState, useEffect, useCallback, useRef, createElement, createContext, useContext, type ReactNode } from "react";
import { api } from "../services/api";
import { useAuth } from "./useAuth";
import { useToast } from "../components/ui/use-toast";
import { consentApi } from "@/lib/api";

// ==========================================
// ✅ CONSTANTES LGPD
// ==========================================
export const LGPD_VERSION = "v1.0_2026-05";

export const PURPOSES = {
  ESSENTIAL: "essential",
  AUTH: "authentication",
  SERVICE: "service_delivery",
  ANALYTICS: "analytics",
  MARKETING: "marketing",
  BEHAVIOR: "behavior_tracking",
  AI: "ai_features",
  AI_TRAINING: "ai_training",
} as const;

export type Purpose = (typeof PURPOSES)[keyof typeof PURPOSES];

// Finalidades que NÃO podem ser revogadas (essenciais para o serviço)
export const ESSENTIAL_PURPOSES = [
  PURPOSES.ESSENTIAL,
  PURPOSES.AUTH,
  PURPOSES.SERVICE,
] as const;

export const OPTIONAL_PURPOSES: Purpose[] = [
  PURPOSES.ANALYTICS,
  PURPOSES.MARKETING,
  PURPOSES.BEHAVIOR,
  PURPOSES.AI,
  PURPOSES.AI_TRAINING,
];

// ==========================================
// ✅ INTERFACES
// ==========================================
export interface ConsentRecord {
  id: number;
  version: string;
  purposes: string[];
  accepted_at: string;
  revoked_at: string | null;
  is_active: boolean;
  purposes_granted?: string[];
  can_revoke?: string[];
}

export interface ConsentContextData {
  consents: ConsentRecord[];
  loading: boolean;
  initialized: boolean;
  essentialPurposes: string[];
  revocablePurposes: string[];
  recordConsent: (purposes: Purpose[], email?: string, sessionId?: string) => Promise<boolean>;
  revokeConsent: (purpose: Purpose) => Promise<boolean>;
  hasConsent: (purpose: Purpose) => boolean;
  hasValidConsent: (version?: string) => boolean;
  refresh: () => Promise<void>;
}

// ==========================================
// ✅ HOOK PRINCIPAL
// ==========================================
function useConsentStandalone(): ConsentContextData {
  const { user } = useAuth();
  const toastHook = useToast();
  
  // ✅ Garantir que toast é uma função (evita "r is not a function")
  // O hook do shadcn retorna { toast: fn, dismiss: fn, toasts: [] }
  const toast = typeof toastHook === 'function' 
    ? toastHook 
    : (toastHook as any)?.toast;
  
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [essentialPurposes, setEssentialPurposes] = useState<string[]>([...ESSENTIAL_PURPOSES]);
  const [revocablePurposes, setRevocablePurposes] = useState<string[]>([...OPTIONAL_PURPOSES]);
  // ⚠️ CORREÇÃO DO LOOP INFINITO: usamos um ref (não state) como guarda de
  // "já está buscando". Antes, `loading` (state) estava nas deps do
  // useCallback abaixo — toda vez que loadConsents mudava `loading`, a
  // própria função ganhava uma nova identidade, o que fazia o useEffect que
  // depende dela (mais abaixo) disparar de novo, chamando loadConsents outra
  // vez, pra sempre. Um ref não causa re-render nem muda a identidade da
  // função, então quebra o loop mantendo a mesma proteção contra chamadas
  // concorrentes.
  const loadingRef = useRef(false);
  // ✅ true somente após a PRIMEIRA busca de consentimentos completar.
  // Sem isso, quem consome o hook não distingue "ainda não buscou"
  // (consents=[] e loading=false no estado inicial) de "buscou e não tem
  // nada" — e era exatamente essa ambiguidade que fazia o modal de
  // consentimento reabrir indevidamente.
  const [initialized, setInitialized] = useState(false);

  // ✅ Função para carregar consentimentos
  const loadConsents = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;
    
    // ✅ Evitar chamadas duplicadas se já está carregando (a menos que forceRefresh)
    if (!forceRefresh && loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    try {
      console.log("🔄 Fetching consents from API...", { forceRefresh, userId: user.id });
      
      const resp = await api.get("/consent/my/", {
        params: { t: forceRefresh ? Date.now() : null } // Cache buster
      });
      const data = resp.data;
      
      console.log("✅ Consents API response:", {
        count: data.consents?.length,
        firstConsent: data.consents?.[0] ? {
          id: data.consents[0].id,
          version: data.consents[0].version,
          purposes: data.consents[0].purposes,
          purposesType: typeof data.consents[0].purposes,
          isArray: Array.isArray(data.consents[0].purposes),
        } : null,
      });
      
      setConsents(data.consents || []);
      if (data.essential_purposes?.length) {
        setEssentialPurposes(data.essential_purposes);
      }
      if (data.revocable_purposes?.length) {
        setRevocablePurposes(data.revocable_purposes);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error("❌ Erro ao carregar consentimentos:", error);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialized(true);
    }
  }, [user?.id]); // ⚠️ 'loading' removido de propósito — ver comentário acima

  // ✅ Carregar consentimentos apenas se usuário estiver autenticado
  useEffect(() => {
    if (user?.id) {
      loadConsents();
    } else {
      // Se não tem user, limpa estados
      setConsents([]);
      setEssentialPurposes([...ESSENTIAL_PURPOSES]);
      setRevocablePurposes([...OPTIONAL_PURPOSES]);
      setLoading(false);
    }
  }, [user?.id, loadConsents]); // agora loadConsents só muda quando user?.id muda

  // ✅ Registrar consentimento - Suporta usuários autenticados e anônimos
  const recordConsent = useCallback(async (
    purposes: Purpose[],
    email?: string,
    sessionId?: string
  ): Promise<boolean> => {
    try {
      const data = await consentApi.record({
        email: email || user?.email,
        session_id: sessionId,
        version: LGPD_VERSION,
        purposes,
        accepted_at: new Date().toISOString(),
      });
      
      // ⚠️ CORREÇÃO DO BUG "salvou mas não salvou":
      // Antes, a resposta do POST /consent/ era inserida direto na lista de
      // consentimentos. Mas essa resposta tem OUTRO formato:
      //   { status, consent_id, version, purposes_granted, can_revoke }
      // e a lista espera objetos com { id, is_active, purposes }.
      // Resultado: o objeto entrava sem `is_active` nem `purposes`, então
      // hasConsent() devolvia FALSE logo após salvar — o banner reaparecia e
      // o toggle continuava desligado, mesmo com o registro gravado no banco.
      // Além disso, os registros antigos (que o backend acabou de revogar por
      // supersede) continuavam na lista como ativos, deixando o estado local
      // divergente do servidor.
      //
      // Agora recarregamos do servidor, que é a fonte de verdade.
      await loadConsents(true);
      
      // ✅ Mostrar toast apenas se for função
      if (typeof toast === 'function') {
        toast({
          title: "✅ Consentimento registrado",
          description: "Suas preferências de privacidade foram salvas.",
        });
      }
      
      return true;
    } catch (error: any) {
      const status = error.response?.status;
      
      // Não mostrar toast para erros esperados
      if (status !== 400 && status !== 404 && typeof toast === 'function') {
        toast({
          title: "❌ Erro ao registrar consentimento",
          description: error.message || "Tente novamente em alguns instantes",
          variant: "destructive",
        });
      }
      
      if (import.meta.env.DEV) {
        console.error("❌ Consent record error:", {
          status,
          message: error.message,
          data: error.response?.data,
        });
      }
      
      return false;
    }
  }, [user?.email, toast, loadConsents]);

  // ✅ Revogar consentimento para finalidade específica
  const revokeConsent = useCallback(async (purpose: Purpose): Promise<boolean> => {
    // ✅ Não permite revogar finalidades essenciais
    if (essentialPurposes.includes(purpose as any)) {
      if (typeof toast === 'function') {
        toast({
          title: "⚠️ Não é possível revogar",
          description: `A finalidade "${purpose}" é essencial para o funcionamento do sistema.`,
          variant: "destructive",
        });
      }
      return false;
    }
    
    try {
      await api.delete(`/consent/revoke/${purpose}/`);
      
      // Recarrega do servidor em vez de deduzir o novo estado localmente.
      // A revogação no backend pode afetar mais de um registro (supersede),
      // e adivinhar isso no cliente gera divergência entre o que a tela
      // mostra e o que está gravado.
      await loadConsents(true);
      
      if (typeof toast === 'function') {
        toast({
          title: "✅ Consentimento revogado",
          description: `Você não receberá mais tratamentos para "${purpose}".`,
        });
      }
      
      return true;
    } catch (error: any) {
      console.error("Erro ao revogar consentimento:", error);
      
      if (typeof toast === 'function') {
        toast({
          title: "❌ Erro ao revogar consentimento",
          description: error.message || "Tente novamente",
          variant: "destructive",
        });
      }
      
      return false;
    }
  }, [essentialPurposes, toast, loadConsents]);

  // ✅ Verificar se usuário tem consentimento ativo para finalidade
  const hasConsent = useCallback((purpose: Purpose): boolean => {
    return consents.some(c => c.is_active && Array.isArray(c.purposes) && c.purposes.includes(purpose));
  }, [consents]);

  // ✅ NOVO: Verificar se usuário tem consentimento VÁLIDO para a versão atual
  const hasValidConsent = useCallback((version: string = LGPD_VERSION): boolean => {
    return consents.some(c => 
      c.is_active && 
      c.version === version &&
      essentialPurposes.every(p => c.purposes.includes(p))
    );
  }, [consents, essentialPurposes]);

  // ✅ Expor refresh forçado
  const refresh = useCallback(async () => {
    console.log("🔄 Manual refresh called");
    await loadConsents(true);
  }, [loadConsents]);

  return {
    consents,
    loading,
    initialized,
    essentialPurposes,
    revocablePurposes,
    recordConsent,
    revokeConsent,
    hasConsent,
    hasValidConsent,
    refresh,
  };
}

// ==========================================
// ✅ CONTEXT PROVIDER (fonte única)
// ==========================================
// CORREÇÃO (Auditoria P2.4): antes, cada componente que chamava useConsent()
// criava um estado independente e disparava seu PRÓPRIO fetch de
// /consent/my/ — nos logs isso aparecia como dezenas de "Fetching consents"
// repetidos a cada navegação/re-render. Com o Provider, existe UMA instância:
// um fetch por sessão (mais os refresh explícitos), compartilhado por todos.
const ConsentContext = createContext<ConsentContextData | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const value = useConsentStandalone();
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextData {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    // Regras de hooks impedem um fallback condicional para a versão
    // standalone (o hook interno seria chamado condicionalmente). Exigir o
    // Provider é o comportamento correto: App.tsx já envolve a árvore.
    throw new Error("useConsent deve ser usado dentro de <ConsentProvider> (ver App.tsx).");
  }
  return ctx;
}