// src/components/CookieConsentBanner.tsx
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { X } from "lucide-react";

const CONSENT_KEY = "cookie_consent_accepted";
const CONSENT_VERSION = "v1.0_2026-05";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // ✅ Verifica se já aceitou (localStorage)
    const accepted = localStorage.getItem(CONSENT_KEY);
    const version = localStorage.getItem("cookie_consent_version");
    
    // Só mostra se nunca aceitou OU se a versão mudou
    if (!accepted || version !== CONSENT_VERSION) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    // ✅ Salva no localStorage (fallback offline)
    localStorage.setItem(CONSENT_KEY, "true");
    localStorage.setItem("cookie_consent_version", CONSENT_VERSION);
    
    // ✅ Registra no backend (anonimamente, se possível)
    registerAnonymousConsent().catch(() => {
      // Se falhar, não bloqueia a UX - localStorage já salvou
      console.warn("⚠️ Não foi possível registrar consentimento no backend");
    });
    
    setVisible(false);
  };

  const registerAnonymousConsent = async () => {
    try {
      // Gera session_id único para rastrear anônimo
      let sessionId = localStorage.getItem("anonymous_session_id");
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem("anonymous_session_id", sessionId);
      }
      
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/consent/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          version: CONSENT_VERSION,
          purposes: ["essential", "service_delivery"], // Apenas o básico
          accepted_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("❌ Erro ao registrar consentimento anônimo:", error);
      throw error;
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Usamos cookies essenciais para o funcionamento do sistema e para conformidade com a LGPD. 
            <a href="/privacidade" className="text-brand hover:underline ml-1">Saiba mais</a>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/privacidade"}>
            Ler política
          </Button>
          <Button size="sm" onClick={handleAccept} className="bg-brand hover:bg-brand/90">
            Aceitar e continuar
          </Button>
        </div>
      </div>
    </div>
  );
}