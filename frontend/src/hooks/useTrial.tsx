// hooks/useTrial.tsx
// Estado do período de teste. Lê do /profile/ (que já tem cache), então não
// gera requisição extra.
import { useState, useEffect } from "react";
import { profileApi } from "../lib/api";
import { useAuth } from "./useAuth";

export type AccessStatus = "trial" | "trial_expired" | "subscribed" | "no_trial";

export interface TrialState {
  status: AccessStatus;
  /** Dias inteiros restantes. 0 quando acabou. */
  daysLeft: number;
  /** Está no teste agora. */
  isTrialing: boolean;
  /** Teste acabou e não assinou — o uso fica bloqueado até assinar. */
  isExpired: boolean;
  /** Tem acesso aos recursos completos (assinante ou em teste). */
  hasProAccess: boolean;
  /** Últimos dias — hora de reforçar o aviso. */
  isEnding: boolean;
  loading: boolean;
}

// A partir de quantos dias restantes o aviso fica mais insistente.
const AVISO_FINAL = 4;

export function useTrial(): TrialState {
  const { user } = useAuth();
  const [estado, setEstado] = useState<Omit<TrialState, "loading">>({
    status: "no_trial",
    daysLeft: 0,
    isTrialing: false,
    isExpired: false,
    hasProAccess: false,
    isEnding: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelado = false;

    profileApi
      .get()
      .then((p: any) => {
        if (cancelado || !p) return;
        const sub = p.subscription_status || {};
        const status: AccessStatus = sub.access_status || "no_trial";
        const daysLeft: number = sub.trial_days_left ?? 0;

        setEstado({
          status,
          daysLeft,
          isTrialing: status === "trial",
          isExpired: status === "trial_expired",
          hasProAccess: sub.has_pro_access ?? p.plan === "pro",
          isEnding: status === "trial" && daysLeft <= AVISO_FINAL,
        });
      })
      .catch(() => {
        /* mantém o padrão: sem trial conhecido, nada é bloqueado pela interface */
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
    // user?.id (primitivo) para não re-disparar a cada navegação
  }, [user?.id]);

  return { ...estado, loading };
}