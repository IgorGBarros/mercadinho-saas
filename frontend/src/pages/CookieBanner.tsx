import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X, ChevronDown, ChevronUp, Shield, BarChart3, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type CookieConsent = {
  necessary: true;         // sempre true, não pode ser desativado
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
  version: string;
};

const CONSENT_KEY = "minhaamora_cookie_consent";
const CONSENT_VERSION = "1.0";

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getCookieConsent(): CookieConsent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CookieConsent;
    // Invalida versão antiga
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCookieConsent(consent: Omit<CookieConsent, "necessary" | "acceptedAt" | "version">) {
  const full: CookieConsent = {
    necessary: true,
    analytics: consent.analytics,
    marketing: consent.marketing,
    acceptedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(full));
  return full;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function CookieBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) {
      // Pequeno delay para não atrapalhar o carregamento da página
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    saveCookieConsent({ analytics: true, marketing: true });
    setVisible(false);
  };

  const handleRejectOptional = () => {
    saveCookieConsent({ analytics: false, marketing: false });
    setVisible(false);
  };

  const handleSavePreferences = () => {
    saveCookieConsent({ analytics, marketing });
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
      >
        <div className="mx-auto max-w-4xl rounded-2xl border border-[#871745]/20 bg-card shadow-2xl shadow-[#871745]/10 overflow-hidden">
          {/* Barra decorativa topo */}
          <div className="h-1 w-full bg-gradient-to-r from-[#871745] via-[#c4558a] to-[#871745]" />

          <div className="p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-start gap-4 mb-4">
              <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[#871745]/10">
                <Cookie className="h-5 w-5 text-[#871745]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-base font-bold text-foreground">
                  Suas preferências de privacidade
                </h2>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Usamos cookies para melhorar sua experiência, analisar o desempenho do app e, com sua permissão, 
                  personalizar conteúdo. Você pode ajustar suas preferências a qualquer momento.{" "}
                  <button
                    onClick={() => navigate("/privacy")}
                    className="text-[#871745] underline underline-offset-2 hover:no-underline font-medium"
                  >
                    Política de Privacidade
                  </button>
                  {" "}e{" "}
                  <button
                    onClick={() => navigate("/terms")}
                    className="text-[#871745] underline underline-offset-2 hover:no-underline font-medium"
                  >
                    Termos de Uso
                  </button>
                  .
                </p>
              </div>
            </div>

            {/* Painel de Detalhes */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mb-5 space-y-3 rounded-xl bg-[#FDF2F7]/60 border border-[#871745]/10 p-4">
                    {/* Necessários - bloqueado */}
                    <CookieCategory
                      icon={<Shield className="h-4 w-4 text-[#871745]" />}
                      title="Cookies Necessários"
                      description="Essenciais para o funcionamento do aplicativo: autenticação, segurança e preferências básicas. Não podem ser desativados."
                      enabled={true}
                      locked={true}
                    />
                    {/* Analytics */}
                    <CookieCategory
                      icon={<BarChart3 className="h-4 w-4 text-[#871745]" />}
                      title="Cookies de Desempenho"
                      description="Nos ajudam a entender como você usa o app para melhorar a experiência. Dados anonimizados e agregados."
                      enabled={analytics}
                      onToggle={() => setAnalytics((v) => !v)}
                    />
                    {/* Marketing */}
                    <CookieCategory
                      icon={<Zap className="h-4 w-4 text-[#871745]" />}
                      title="Cookies de Marketing"
                      description="Permitem personalizar comunicações e medir a eficácia de campanhas promocionais."
                      enabled={marketing}
                      onToggle={() => setMarketing((v) => !v)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ações */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? (
                  <><ChevronUp className="h-4 w-4" /> Ocultar opções</>
                ) : (
                  <><ChevronDown className="h-4 w-4" /> Personalizar preferências</>
                )}
              </button>

              <div className="flex flex-col gap-2 sm:flex-row">
                {showDetails ? (
                  <>
                    <button
                      onClick={handleRejectOptional}
                      className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Apenas necessários
                    </button>
                    <button
                      onClick={handleSavePreferences}
                      className="rounded-xl border border-[#871745] px-4 py-2.5 text-sm font-semibold text-[#871745] hover:bg-[#871745]/5 transition-colors"
                    >
                      Salvar preferências
                    </button>
                    <button
                      onClick={handleAcceptAll}
                      className="rounded-xl bg-[#871745] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#871745]/90 transition-colors shadow-md shadow-[#871745]/20"
                    >
                      Aceitar todos
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleRejectOptional}
                      className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Apenas necessários
                    </button>
                    <button
                      onClick={handleAcceptAll}
                      className="rounded-xl bg-[#871745] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#871745]/90 transition-colors shadow-md shadow-[#871745]/20"
                    >
                      Aceitar todos os cookies
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Rodapé LGPD */}
            <p className="mt-4 text-[11px] text-muted-foreground/60 text-center leading-relaxed border-t border-border pt-3">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018). 
              Você pode revogar seu consentimento a qualquer momento nas configurações da sua conta.
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Sub-componente: Categoria de Cookie ─────────────────────────────────────
interface CookieCategoryProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
}

function CookieCategory({ icon, title, description, enabled, locked, onToggle }: CookieCategoryProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-border mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {/* Toggle */}
          <button
            onClick={locked ? undefined : onToggle}
            disabled={locked}
            aria-label={locked ? "Sempre ativo" : enabled ? "Desativar" : "Ativar"}
            className={`relative shrink-0 h-5 w-9 rounded-full transition-colors ${
              enabled ? "bg-[#871745]" : "bg-border"
            } ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:opacity-90"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        {locked && (
          <span className="mt-1 inline-block text-[10px] font-semibold text-[#871745] bg-[#871745]/10 px-1.5 py-0.5 rounded">
            Sempre ativo
          </span>
        )}
      </div>
    </div>
  );
} 