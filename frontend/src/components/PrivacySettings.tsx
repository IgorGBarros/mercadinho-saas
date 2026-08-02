// src/components/PrivacySettings.tsx
// Seção de "Privacidade (LGPD)" para a página de Configurações.
// Permite à consultora ver o que está ativo, ativar finalidades opcionais
// e revogar (desmarcar) — com um aviso de consequências antes de revogar,
// como exige a boa prática e o direito de revogação do art. 18, IX da LGPD.
import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import {
  useConsent,
  type Purpose,
  ESSENTIAL_PURPOSES,
  OPTIONAL_PURPOSES,
} from "../hooks/useConsent";

const LABELS: Record<string, { title: string; desc: string; consequence: string }> = {
  analytics: {
    title: "Análise de uso e melhorias",
    desc: "Métricas anônimas para evoluirmos o produto.",
    consequence: "Seus dados de uso deixarão de contribuir para melhorias do produto.",
  },
  marketing: {
    title: "Comunicações e ofertas",
    desc: "Receber novidades, dicas e promoções por email.",
    consequence: "Você deixará de receber novidades, dicas e ofertas por email.",
  },
  behavior_tracking: {
    title: "Rastreamento de comportamento",
    desc: "Entender como você usa o sistema para personalizar.",
    consequence: "O sistema deixará de personalizar a experiência com base no seu uso.",
  },
  ai_features: {
    title: "Recursos de inteligência artificial",
    desc: "Análises e sugestões geradas por IA sobre seu estoque.",
    consequence: "A assistente Amorinha e as sugestões de IA serão DESATIVADAS para sua conta.",
  },
  ai_training: {
    title: "Treinamento de modelos de IA",
    desc: "Usar dados de entrada/saída de estoque (produto, quantidade, preço, data) para treinar os modelos da plataforma. Sem nome de cliente, CPF, RG ou endereço.",
    consequence: "Seus dados de estoque deixarão de contribuir para o treinamento dos modelos de IA.",
  },
};

export default function PrivacySettings() {
  const {
    initialized,
    loading,
    hasConsent,
    recordConsent,
    revokeConsent,
    consents,
  } = useConsent();
  const [busy, setBusy] = useState<Purpose | null>(null);

  const handleToggle = async (purpose: Purpose, currentlyOn: boolean) => {
    if (busy) return;

    if (currentlyOn) {
      // ⚠️ Aviso de consequências ANTES de revogar
      const info = LABELS[purpose];
      const ok = window.confirm(
        `Desativar "${info.title}"?\n\n` +
          `Consequência: ${info.consequence}\n\n` +
          `Você pode reativar quando quiser aqui em Configurações. Deseja continuar?`
      );
      if (!ok) return;
      setBusy(purpose);
      await revokeConsent(purpose);
      setBusy(null);
    } else {
      // Reativar: regrava o consentimento com as finalidades atuais + esta
      const ativos = consents
        .filter((c) => c.is_active)
        .flatMap((c) => (Array.isArray(c.purposes) ? c.purposes : []));
      const novas = [
        ...new Set<Purpose>([
          ...ESSENTIAL_PURPOSES,
          ...(ativos as Purpose[]),
          purpose,
        ]),
      ];
      setBusy(purpose);
      await recordConsent(novas);
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
        <Shield className="h-4 w-4 text-brand" /> Privacidade (LGPD)
      </h2>
      <p className="text-xs text-muted-foreground">
        Gerencie como seus dados podem ser usados. As finalidades essenciais
        (funcionamento, autenticação e entrega do serviço) não podem ser
        desativadas pois o sistema não funciona sem elas.
      </p>

      {!initialized || loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando preferências...
        </div>
      ) : (
        <div className="space-y-3">
          {OPTIONAL_PURPOSES.map((purpose) => {
            const on = hasConsent(purpose);
            const info = LABELS[purpose];
            if (!info) return null;
            return (
              <div key={purpose} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{info.title}</p>
                  <p className="text-xs text-muted-foreground">{info.desc}</p>
                </div>
                <button
                  onClick={() => handleToggle(purpose, on)}
                  disabled={busy !== null}
                  aria-label={on ? `Desativar ${info.title}` : `Ativar ${info.title}`}
                  className={`relative shrink-0 mt-0.5 h-5 w-9 rounded-full transition-colors ${
                    on ? "bg-brand" : "bg-border"
                  } ${busy === purpose ? "opacity-60" : "hover:opacity-90"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      on ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}