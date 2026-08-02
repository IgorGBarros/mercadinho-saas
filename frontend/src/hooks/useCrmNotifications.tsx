// hooks/useCrmNotifications.tsx
// Os três avisos do CRM: novos clientes, aniversários próximos e carrinhos
// abandonados. Segue o mesmo padrão de useTrial/useSubscriptionAlert —
// busca uma vez por sessão de uso, sem polling agressivo.
import { useState, useEffect } from "react";
import { crmNotificationsApi, type CrmNotifications } from "../lib/api";
import { useAuth } from "./useAuth";

export interface CrmNotificationItem {
  key: string;
  tipo: "novo_lead" | "aniversario" | "carrinho_abandonado";
  titulo: string;
  descricao: string;
}

export function useCrmNotifications() {
  const { user } = useAuth();
  const [itens, setItens] = useState<CrmNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelado = false;

    crmNotificationsApi
      .get()
      .then((d: CrmNotifications) => {
        if (cancelado) return;
        const lista: CrmNotificationItem[] = [];

        if (d.novos_leads.length > 0) {
          const nomes = d.novos_leads.slice(0, 3).map((l) => l.name).join(", ");
          lista.push({
            key: "novos_leads",
            tipo: "novo_lead",
            titulo: `${d.novos_leads.length} ${d.novos_leads.length === 1 ? "cliente novo" : "clientes novos"}`,
            descricao: d.novos_leads.length <= 3 ? nomes : `${nomes} e mais ${d.novos_leads.length - 3}`,
          });
        }

        for (const a of d.aniversarios) {
          lista.push({
            key: `aniversario-${a.id}`,
            tipo: "aniversario",
            titulo: `Aniversário de ${a.name}`,
            descricao: new Date(a.date + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long",
            }),
          });
        }

        for (const c of d.carrinhos_abandonados) {
          lista.push({
            key: `carrinho-${c.cart_id}`,
            tipo: "carrinho_abandonado",
            titulo: `${c.lead_name} deixou produtos na sacola`,
            descricao: c.items.slice(0, 2).join(", ") + (c.items.length > 2 ? "..." : ""),
          });
        }

        setItens(lista);
      })
      .catch(() => { /* mantém a lista vazia — não é motivo pra quebrar o sino */ })
      .finally(() => { if (!cancelado) setLoading(false); });

    return () => { cancelado = true; };
  }, [user?.id]);

  return { crmItens: itens, crmLoading: loading };
}
