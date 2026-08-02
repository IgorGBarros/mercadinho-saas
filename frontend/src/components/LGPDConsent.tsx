// components/LGPDConsent.tsx
import { useState, useEffect } from "react";
import { api } from "../services/api";

interface LGPDConsentProps {
  onAccept?: (consent: LGPDConsentData) => void;
  context?: "landing" | "auth" | "app";
}

export interface LGPDConsentData {
  essential: boolean;      // Sempre true (necessário para funcionamento)
  analytics: boolean;      // Google Analytics, Hotjar, etc.
  marketing: boolean;      // Pixels, remarketing
  behavior_tracking: boolean; // Captura de comportamento no app
  ai_features: boolean;    // Uso de IA para insights
  accepted_at: string;
  term_version: string;
}

const CURRENT_TERM_VERSION = "v1.0_2026-05";

export default function LGPDConsent({ onAccept, context = "app" }: LGPDConsentProps) {
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState<LGPDConsentData>({
    essential: true,
    analytics: false,
    marketing: false,
    behavior_tracking: false,
    ai_features: false,
    accepted_at: "",
    term_version: CURRENT_TERM_VERSION,
  });

  // Verifica se já consentiu
  useEffect(() => {
    const stored = localStorage.getItem("lgpd_consent");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Se versão do termo mudou, pede novo consentimento
        if (parsed.term_version === CURRENT_TERM_VERSION) {
          onAccept?.(parsed);
          return;
        }
      } catch {}
    }
    setVisible(true);
  }, [onAccept]);

  const handleAccept = async () => {
    const consentData: LGPDConsentData = {
      ...consent,
      accepted_at: new Date().toISOString(),
      term_version: CURRENT_TERM_VERSION,
    };

    // Salva no frontend
    localStorage.setItem("lgpd_consent", JSON.stringify(consentData));
    
    // Envia para backend (se usuário logado)
    try {
      await api.post("/consent/", consentData).catch(() => {
        // Se falhar, não bloqueia o fluxo
        console.warn("Não foi possível salvar consentimento no backend");
      });
    } catch (error) {
      console.error("Erro ao salvar consentimento:", error);
    }

    onAccept?.(consentData);
    setVisible(false);
  };

  const handleRejectNonEssential = () => {
    const minimalConsent: LGPDConsentData = {
      essential: true,
      analytics: false,
      marketing: false,
      behavior_tracking: false,
      ai_features: false,
      accepted_at: new Date().toISOString(),
      term_version: CURRENT_TERM_VERSION,
    };
    localStorage.setItem("lgpd_consent", JSON.stringify(minimalConsent));
    onAccept?.(minimalConsent);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-4 shadow-lg">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Texto explicativo */}
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">
              🍇 Sua privacidade é importante
            </p>
            <p>
              Usamos cookies e dados para melhorar sua experiência. 
              Você pode escolher quais aceita. 
              <a href="/privacidade" target="_blank" className="text-brand hover:underline ml-1">
                Ver Política de Privacidade
              </a>
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRejectNonEssential}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary transition-colors"
            >
              Apenas essenciais
            </button>
            <button
              onClick={handleAccept}
              className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
            >
              Aceitar tudo
            </button>
          </div>
        </div>

        {/* Opções granulares (expansível) */}
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Personalizar preferências ▼
          </summary>
          <div className="mt-3 space-y-2 pl-2 border-l-2 border-border">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={consent.analytics}
                onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
                className="rounded"
              />
              <span>Analytics de uso (melhorias no produto)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={consent.marketing}
                onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                className="rounded"
              />
              <span>Marketing e remarketing</span>
            </label>
            {context === "app" && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={consent.behavior_tracking}
                    onChange={(e) => setConsent({ ...consent, behavior_tracking: e.target.checked })}
                    className="rounded"
                  />
                  <span>Captura de comportamento para IA</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={consent.ai_features}
                    onChange={(e) => setConsent({ ...consent, ai_features: e.target.checked })}
                    className="rounded"
                  />
                  <span>Recursos de IA (Amorinha, insights)</span>
                </label>
              </>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}