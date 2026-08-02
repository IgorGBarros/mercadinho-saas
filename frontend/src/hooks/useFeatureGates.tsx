// src/hooks/useFeatureGates.ts
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "../services/api";
import { useAuth } from "./useAuth";

// ==========================================
// ✅ INTERFACES
// ==========================================
export interface FeatureGate {
  feature_key: string;
  label: string;
  description: string | null;
  requires_pro: boolean;
  enabled?: boolean;
}

export interface FeatureGatesContextData {
  gates: FeatureGate[];
  loading: boolean;
  isFeatureEnabled: (featureKey: string) => boolean;
  isLocked: (featureKey: string) => boolean;
  refresh: () => Promise<void>;
}

// ==========================================
// ✅ CONTEXT
// ==========================================
const FeatureGatesContext = createContext<FeatureGatesContextData | undefined>(undefined);

// ==========================================
// ✅ HOOK PRINCIPAL
// ==========================================
export function useFeatureGates(): FeatureGatesContextData {
  const context = useContext(FeatureGatesContext);
  
  if (!context) {
    throw new Error("useFeatureGates deve ser usado dentro de FeatureGatesProvider");
  }
  
  return context;
}

// ==========================================
// ✅ PROVIDER COMPONENT
// ==========================================
export function FeatureGatesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [gates, setGates] = useState<FeatureGate[]>([]);
  const [loading, setLoading] = useState(true);

  // Gates padrão como fallback
  const DEFAULT_GATES: FeatureGate[] = [
    { feature_key: "barcode_scanner", label: "Scanner de Código", description: null, requires_pro: true },
    { feature_key: "ocr_expiry", label: "Leitor de Validade (IA)", description: null, requires_pro: true },
    { feature_key: "dashboard_charts", label: "Gráficos Avançados", description: null, requires_pro: true },
    { feature_key: "storefront", label: "Vitrine Digital", description: null, requires_pro: true },
    { feature_key: "ai_insights", label: "Insights com IA", description: null, requires_pro: true },
    { feature_key: "unlimited_products", label: "Produtos Ilimitados", description: null, requires_pro: true },
  ];

  // ✅ Carregar gates da API
  const loadGates = useCallback(async () => {
    // Se não tem usuário, usa gates padrão e para
    if (!user?.id) {
      setGates(DEFAULT_GATES);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const resp = await api.get("/admin/feature-gates/");
      setGates(resp.data);
    } catch (error) {
      // ✅ Fallback silencioso em produção
      if (import.meta.env.DEV) {
        console.warn("⚠️ Feature gates API indisponível, usando padrão local:", error);
      }
      setGates(DEFAULT_GATES);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ✅ Carregar ao montar ou mudar usuário
  useEffect(() => {
    loadGates();
  }, [loadGates]);

  // ✅ Verificar se feature está habilitada
  const isFeatureEnabled = useCallback((featureKey: string): boolean => {
    const gate = gates.find(g => g.feature_key === featureKey);
    
    // Se não encontrou a gate, retorna false (seguro por padrão)
    if (!gate) return false;
    
    // Se requer PRO, verifica plano do usuário
    if (gate.requires_pro && user?.plan !== "pro") {
      return false;
    }
    
    // Se tem flag enabled explícita, usa ela; senão, assume true
    return gate.enabled ?? true;
  }, [gates, user?.plan]);

  // ✅ Refresh manual
  const refresh = useCallback(async () => {
    await loadGates();
  }, [loadGates]);

  // ✅ Inverso de isFeatureEnabled — existia código em produção (Index.tsx,
  // AddProduct.tsx) esperando esse método, mas ele nunca foi implementado
  // aqui. Index.tsx quebrava em runtime (isLocked não era função);
  // AddProduct.tsx contornava isso apelidando isFeatureEnabled de isLocked,
  // o que invertia a lógica de bloqueio. Ambos foram corrigidos para usar
  // este método real.
  const isLocked = useCallback(
    (featureKey: string): boolean => !isFeatureEnabled(featureKey),
    [isFeatureEnabled]
  );

  // ✅ Valor do contexto
  const value: FeatureGatesContextData = {
    gates,
    loading,
    isFeatureEnabled,
    isLocked,
    refresh,
  };

  return (
    <FeatureGatesContext.Provider value={value}>
      {children}
    </FeatureGatesContext.Provider>
  );
}