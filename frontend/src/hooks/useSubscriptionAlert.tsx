// hooks/useSubscriptionAlert.tsx
// Avisa a consultora quando a assinatura PRO está perto de vencer ou já
// venceu. Os dados já vêm do /profile/ (que tem cache de 30s), então isso
// não gera requisição extra.
import { useState, useEffect } from "react";
import { profileApi } from "../lib/api";
import { useAuth } from "./useAuth";

export interface SubscriptionAlert {
  /** Dias até vencer. Negativo = já venceu. */
  daysLeft: number;
  /** Já passou da data de vencimento. */
  expired: boolean;
  /** Vence em poucos dias — hora de avisar. */
  expiringSoon: boolean;
  expiresAt: string | null;
}

// A partir de quantos dias restantes começamos a avisar.
const AVISAR_A_PARTIR_DE = 7;

export function useSubscriptionAlert() {
  const { user } = useAuth();
  const [alert, setAlert] = useState<SubscriptionAlert | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setAlert(null);
      return;
    }

    let cancelado = false;

    profileApi.get()
      .then((p: any) => {
        if (cancelado || !p) return;

        // Só faz sentido para quem tem PRO.
        if (p.plan !== "pro") {
          setAlert(null);
          return;
        }

        const sub = p.subscription_status || {};
        const expiresAt: string | null = sub.expires_at ?? null;
        const daysLeft: number =
          typeof sub.days_until_expiry === "number" ? sub.days_until_expiry : 0;

        // Sem data de vencimento = cortesia ou upgrade manual: não avisar.
        if (!expiresAt) {
          setAlert(null);
          return;
        }

        // `status` é quem sabe se já venceu — days_until_expiry é limitado a
        // zero no backend e não fica negativo.
        const expired = sub.status === "expired";
        const expiringSoon = !expired && daysLeft <= AVISAR_A_PARTIR_DE;

        setAlert(expired || expiringSoon
          ? { daysLeft, expired, expiringSoon, expiresAt }
          : null);
      })
      .catch(() => { if (!cancelado) setAlert(null); });

    return () => { cancelado = true; };
    // Depende de user?.id (primitivo) para não re-disparar a cada navegação.
  }, [user?.id]);

  return { subscriptionAlert: alert };
}