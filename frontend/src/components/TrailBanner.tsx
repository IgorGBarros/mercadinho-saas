// components/TrialBanner.tsx
//
// Dois componentes do período de teste:
//   • TrialBanner        — faixa discreta com a contagem regressiva
//   • TrialExpiredScreen — bloqueio suave quando o teste acaba
import { useNavigate } from "react-router-dom";
import { Sparkles, Clock, Lock, Download } from "lucide-react";
import { useTrial } from "../hooks/useTrial";
import { consentApi } from "../lib/api";

export function TrialBanner() {
  const navigate = useNavigate();
  const { isTrialing, isEnding, daysLeft, loading } = useTrial();

  if (loading || !isTrialing) return null;

  const texto =
    daysLeft <= 1 ? "Seu teste termina hoje" : `Faltam ${daysLeft} dias de teste`;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs ${
        isEnding
          ? "border-b border-amber-500/20 bg-amber-500/10"
          : "border-b border-brand/10 bg-brand/5"
      }`}
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        {isEnding ? (
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" />
        )}
        {texto}
      </span>
      <button
        onClick={() => navigate("/plans")}
        className="font-semibold text-brand hover:underline"
      >
        Assinar agora
      </button>
    </div>
  );
}

export function TrialExpiredScreen() {
  const navigate = useNavigate();

  // Exportação garantida mesmo com o teste expirado — é direito de
  // portabilidade da LGPD, não um recurso do plano. Nada é apagado.
  const exportarDados = async () => {
    try {
      const dados = await consentApi.exportData();
      const blob = new Blob([JSON.stringify(dados, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meus-dados-minha-amora.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* silencioso: o botão de planos continua sendo o caminho principal */
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
        <Lock className="h-7 w-7 text-brand" />
      </div>

      <h1 className="font-display text-lg font-bold text-foreground">
        Seu teste terminou
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Seus produtos, vendas e vitrine continuam salvos. Escolha um plano para
        voltar a usar tudo de onde parou.
      </p>

      <button
        onClick={() => navigate("/plans")}
        className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
      >
        Ver planos
      </button>

      <button
        onClick={exportarDados}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Baixar meus dados
      </button>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Nada é apagado. Você pode exportar seus dados a qualquer momento.
      </p>
    </div>
  );
}