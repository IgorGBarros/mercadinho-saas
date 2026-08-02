import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { profileApi } from "../lib/api";
import { useAuth } from "./useAuth";

export type PlanType = "free" | "pro";

interface PlanCtx {
  plan: PlanType;
  isPro: boolean;
  loading: boolean;
  productLimit: number;
  refresh: () => void;
  setAdminOverride: (enabled: boolean) => void;
}

const PlanContext = createContext<PlanCtx>({
  plan: "free",
  isPro: false,
  loading: true,
  productLimit: 50,
  refresh: () => {},
  setAdminOverride: () => {},
});

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>("free");
  // ✅ Fonte única de verdade do limite: current_limits.max_products vem do
  // PlanConfig no backend (via /profile/). Antes o frontend fixava 50 aqui
  // enquanto o backend usava o PlanConfig (fallback 20) — dois números
  // diferentes para a mesma regra. O 50 permanece só como fallback se a
  // resposta não trouxer o campo.
  const [productLimitState, setProductLimitState] = useState<number>(50);
  const [adminOverrideState, setAdminOverrideState] = useState(
    () => localStorage.getItem("admin_pro_override") === "true"
  );
  const [loading, setLoading] = useState(true);

  // ⚠️ SEGURANÇA: o override de plano só vale para STAFF. Antes, qualquer
  // pessoa podia abrir o DevTools, rodar
  // localStorage.setItem("admin_pro_override", "true") e desbloquear todos
  // os recursos Pro na interface. O localStorage é do usuário — nunca pode
  // ser fonte de autorização sozinho. (Os limites reais devem ser validados
  // também no backend; isto aqui fecha o desbloqueio de UI.)
  const adminOverride = adminOverrideState && user?.is_staff === true;

  const fetchPlan = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    if (adminOverride) { setPlan("pro"); setLoading(false); return; }
    // profileApi.get() já tem cache de 30s + deduplicação — chamadas
    // repetidas dentro da janela não geram requisição de rede.
    profileApi.get().then((p) => {
      if (p) {
        setPlan((p as any).plan === "pro" ? "pro" : "free");
        const maxFromBackend = (p as any).current_limits?.max_products;
        if (typeof maxFromBackend === "number") setProductLimitState(maxFromBackend);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id, user?.is_staff, adminOverride]);

  const setAdminOverride = (enabled: boolean) => {
    if (enabled) {
      localStorage.setItem("admin_pro_override", "true");
    } else {
      localStorage.removeItem("admin_pro_override");
    }
    setAdminOverrideState(enabled);
  };

  // ⚠️ CORREÇÃO DO REFETCH POR NAVEGAÇÃO: o efeito dependia do OBJETO `user`
  // inteiro. Como o useAuth recria esse objeto (nova referência) em vários
  // momentos, o efeito re-disparava e chamava profileApi.get() a cada
  // navegação — era este o "carregando o profile toda vez pra ver se é pro".
  // Dependendo de user?.id (primitivo), só re-busca quando o usuário
  // realmente muda (login/logout/troca de conta).
  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const isPro = plan === "pro" || adminOverride;
  const productLimit = isPro ? Infinity : productLimitState;

  return (
    <PlanContext.Provider value={{ plan: isPro ? "pro" : plan, isPro, loading, productLimit, refresh: fetchPlan, setAdminOverride }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlan = () => useContext(PlanContext);