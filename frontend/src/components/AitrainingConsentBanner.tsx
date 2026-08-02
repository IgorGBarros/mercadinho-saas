// src/components/AiTrainingConsentBanner.tsx
import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useConsent, PURPOSES } from "../hooks/useConsent";

const DISMISS_KEY = "ai_training_banner_dismissed_at";
const DISMISS_HOURS = 24 * 7; // reaparece em ~1 semana se a pessoa só fechar

/**
 * Convida usuários que JÁ têm consentimento essencial registrado a optar
 * (opcionalmente) por 'ai_training'. Não é bloqueante — diferente do
 * PostAuthConsentModal, que só cuida das finalidades essenciais.
 *
 * Importante: se a pessoa ignorar ou fechar, NADA é enviado ao backend.
 * Ausência de registro = ausência de consentimento, que é o padrão
 * seguro exigido pela LGPD (opt-in, nunca opt-out por omissão).
 */
export default function AiTrainingConsentBanner() {
  const { isAuthenticated } = useAuth();
  const { consents, loading, hasConsent, recordConsent } = useConsent();
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const diffHours = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
      if (diffHours < DISMISS_HOURS) setDismissed(true);
    }
  }, []);

  if (!isAuthenticated || loading || dismissed) return null;

  // Sem nenhum consentimento ainda? Quem cuida disso é o PostAuthConsentModal
  // (finalidades essenciais). Este banner só entra depois disso resolvido.
  if (consents.length === 0) return null;

  // Já decidiu (aceitou) essa finalidade? Não pergunta de novo.
  if (hasConsent(PURPOSES.AI_TRAINING)) return null;

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const jaConsentidas = consents
        .filter((c) => c.is_active)
        .flatMap((c) => c.purposes);
      const novasFinalidades = Array.from(
        new Set([...jaConsentidas, PURPOSES.AI_TRAINING])
      );
      await recordConsent(novasFinalidades as any);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
      <Sparkles className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">
          Ajude a melhorar a IA da plataforma
        </p>
        <p className="text-[10px] text-muted-foreground">
          Podemos usar dados de entrada e saída de estoque da sua loja (sem
          nome de cliente, CPF, RG ou endereço) para treinar nossos modelos
          de IA. É opcional — dá pra desativar quando quiser em Configurações.
        </p>
      </div>
      <button
        onClick={handleAccept}
        disabled={submitting}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Salvando..." : "Aceitar"}
      </button>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}