// pages/Plans.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Crown, Check, X, Sparkles,
  CreditCard, QrCode, Barcode, ShieldCheck, Loader2,
} from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import { useAuth } from "../hooks/useAuth";
import { plansApi, paymentsApi } from "../lib/api";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular

type BillingCycle = "monthly" | "yearly";

// ✅ Fallback caso a API de planos não responda. Os valores REAIS vêm de
// /api/plans/ (PlanConfig) — mesmos que o admin edita e que o Asaas cobra.
const DEFAULT_MONTHLY_PRICE = 39.9;
const DEFAULT_YEARLY_PRICE = 399.0;

const FREE_FEATURES = [
  { text: "Até 50 produtos", included: true },
  { text: "Cadastro e baixa de estoque", included: true },
  { text: "Relatórios básicos", included: true },
  { text: "Vitrine online", included: false },
  { text: "Scanner de validade (OCR)", included: false },
  { text: "Alertas de vencimento", included: false },
  { text: "Histórico completo", included: false },
  { text: "Analytics avançado", included: false },
  { text: "Assistente IA", included: false },
];

const PRO_FEATURES = [
  { text: "Produtos ilimitados", included: true },
  { text: "Cadastro e baixa de estoque", included: true },
  { text: "Relatórios completos", included: true },
  { text: "Vitrine online personalizada", included: true },
  { text: "Scanner de validade (OCR)", included: true },
  { text: "Alertas de vencimento", included: true },
  { text: "Histórico completo", included: true },
  { text: "Analytics avançado", included: true },
  { text: "Assistente IA", included: true },
];

const ADMIN_WHATSAPP = "5511999999999";

export default function Plans() {
  const navigate = useNavigate();
  const { isPro } = usePlan();
  const { user } = useAuth();
  const { toast } = useToast();

  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [processing, setProcessing] = useState(false);

  // ✅ Preços dinâmicos do PlanConfig (via /api/plans/). Enquanto carrega,
  // usa os defaults; se a API responder, substitui pelos valores reais.
  const [monthlyPrice, setMonthlyPrice] = useState(DEFAULT_MONTHLY_PRICE);
  const [yearlyPrice, setYearlyPrice] = useState(DEFAULT_YEARLY_PRICE);

  useEffect(() => {
    plansApi.list()
      .then((plans) => {
        const pro = Array.isArray(plans) ? plans.find((p: any) => p.plan_type === "pro") : null;
        if (pro) {
          if (typeof pro.monthly_price === "number") setMonthlyPrice(pro.monthly_price);
          else if (pro.monthly_price) setMonthlyPrice(parseFloat(pro.monthly_price));
          if (typeof pro.yearly_price === "number") setYearlyPrice(pro.yearly_price);
          else if (pro.yearly_price) setYearlyPrice(parseFloat(pro.yearly_price));
        }
      })
      .catch(() => { /* mantém defaults */ });
  }, []);

  const yearlySavings = (monthlyPrice * 12 - yearlyPrice).toFixed(2).replace(".", ",");
  const currentPrice = billing === "monthly" ? monthlyPrice : yearlyPrice;
  const priceDisplay = currentPrice.toFixed(2).replace(".", ",");
  const perMonthYearly = (yearlyPrice / 12).toFixed(2).replace(".", ",");

  const handleSubscribe = async () => {
    setProcessing(true);
    try {
      // Cria o checkout no Asaas e leva a consultora até lá. A escolha entre
      // Pix, cartão e boleto acontece no checkout do provedor — é lá que os
      // dados sensíveis são tratados, e a confirmação volta pelo webhook,
      // liberando o PRO sozinho (sem comprovante, sem espera de 24h).
      const result = await paymentsApi.createCheckout(billing);

      if (!result?.checkout_url) {
        throw new Error("Não recebemos o link de pagamento. Tente novamente.");
      }

      // window.location (e não window.open): popup de pagamento costuma ser
      // bloqueado pelo navegador.
      window.location.href = result.checkout_url;
    } catch (err: any) {
      const msg: string = err?.message || "";

      if (msg.toLowerCase().includes("já possui")) {
        toast({
          title: "Você já é PRO",
          description: "Sua assinatura está ativa. Aproveite os recursos!",
        });
        setProcessing(false);
        return;
      }

      toast({
        title: "Não foi possível abrir o pagamento",
        description: msg || "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate("/profile")}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">
            Planos & Preços
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-8">
        {/* ══════════════════════════════════════════
            BANNER PRO ATIVO
            ══════════════════════════════════════════ */}
        {isPro && (
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 flex items-center gap-3">
            <Crown className="h-5 w-5 text-brand shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Você já é PRO! 🎉</p>
              <p className="text-xs text-muted-foreground">
                Aproveite todos os recursos premium do sistema.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            BILLING TOGGLE
            ══════════════════════════════════════════ */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setBilling("monthly")}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              billing === "monthly"
                ? "bg-brand text-white shadow-md"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all relative ${
              billing === "yearly"
                ? "bg-brand text-white shadow-md"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual
            <span className="absolute -top-2 -right-2 rounded-full bg-success px-2 py-0.5 text-[9px] font-bold text-white">
              -17%
            </span>
          </button>
        </div>

        {/* ══════════════════════════════════════════
            PLANS GRID
            ══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* FREE Plan */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Free</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Para começar a organizar seu estoque
              </p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-foreground">R$ 0</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <button
              disabled={!isPro}
              className="w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground bg-secondary/50 cursor-default"
            >
              {isPro ? "Seu plano anterior" : "Plano atual"}
            </button>
            <ul className="space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-2 text-sm">
                  {f.included ? (
                    <Check className="h-4 w-4 text-brand shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  )}
                  <span
                    className={
                      f.included ? "text-foreground" : "text-muted-foreground/50"
                    }
                  >
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* PRO Plan */}
          <div className="rounded-2xl border-2 border-brand bg-card p-6 space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-brand text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl">
              Popular
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" /> PRO
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Tudo que você precisa para crescer
              </p>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  R$ {billing === "monthly" ? "39,90" : perMonthYearly}
                </span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              {billing === "yearly" && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Cobrado{" "}
                    <strong className="text-foreground">R$ {priceDisplay}/ano</strong>
                  </p>
                  <p className="text-xs text-brand font-semibold">
                    Economia de R$ {yearlySavings}
                  </p>
                </div>
              )}
            </div>
            {isPro ? (
              <div className="w-full rounded-xl bg-brand/10 border border-brand/30 py-3 text-center text-sm font-semibold text-brand">
                ✓ Plano ativo
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-1">
                Cancele quando quiser, sem multa
              </div>
            )}
            <ul className="space-y-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-brand shrink-0" />
                  <span className="text-foreground">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            CHECKOUT
            ══════════════════════════════════════════ */}
        {!isPro && (
          <div className="space-y-4">
            <button
              onClick={handleSubscribe}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90 transition-opacity disabled:opacity-70"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Abrindo pagamento...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Assinar PRO — R$ {priceDisplay}
                  {billing === "monthly" ? "/mês" : "/ano"}
                </>
              )}
            </button>

            {/* Formas aceitas: informação, não uma escolha a mais.
                A seleção acontece no checkout do Asaas. */}
            <div className="flex items-center justify-center gap-5 py-1">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" /> Pix
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" /> Cartão
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Barcode className="h-3.5 w-3.5" /> Boleto
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-brand shrink-0" />
                Pagamento processado pelo Asaas
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Você escolhe a forma de pagamento na próxima etapa. Seus dados de
                cartão não passam pelo Minha Amora. Assim que o pagamento é
                confirmado, o PRO é liberado automaticamente — sem enviar
                comprovante.
              </p>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Dúvidas antes de assinar?{" "}
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Olá! Tenho uma dúvida sobre o plano PRO.\n\nEmail: ${user?.email || ""}`
                  );
                  window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${msg}`, "_blank");
                }}
                className="font-medium text-brand hover:underline"
              >
                Falar no WhatsApp
              </button>
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════
            FAQ
            ══════════════════════════════════════════ */}
        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold text-foreground text-center">
            Perguntas Frequentes
          </h3>
          {[
            {
              q: "Posso cancelar a qualquer momento?",
              a: "Sim! Sem multa ou fidelidade. O acesso PRO continua até o fim do período pago.",
            },
            {
              q: "O pagamento é seguro?",
              a: "Sim. O pagamento é processado pelo Asaas, instituição autorizada pelo Banco Central. Seus dados de cartão não passam pelo Minha Amora.",
            },
            {
              q: "Quando meu plano PRO é ativado?",
              a: "Assim que o pagamento é confirmado, o PRO é liberado automaticamente. Pix e cartão costumam confirmar na hora; boleto leva de 1 a 3 dias úteis para compensar.",
            },
            {
              q: "E se eu ultrapassar 50 produtos no Free?",
              a: "Você precisará remover produtos ou fazer upgrade para o PRO para adicionar novos.",
            },
          ].map((faq) => (
            <div key={faq.q} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">{faq.q}</p>
              <p className="text-xs text-muted-foreground mt-1">{faq.a}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}