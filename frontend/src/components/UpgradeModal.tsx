// components/UpgradeModal.tsx — CHECKOUT ASAAS INTEGRADO
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Zap, X, ScanBarcode, Camera, Store, MessageCircle,
  BarChart3, Package, Loader2, ShieldCheck,
} from "lucide-react";
import { paymentsApi, plansApi } from "../lib/api";
import { useToast } from "./ui/use-toast";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  description?: string;
}

const PRO_FEATURES = [
  { icon: ScanBarcode, label: "Scanner de Código de Barras" },
  { icon: Camera, label: "OCR de Validade Automático" },
  { icon: Store, label: "Vitrine Digital Completa" },
  { icon: MessageCircle, label: "Assistente IA de Estoque" },
  { icon: BarChart3, label: "Dashboard com Lucro Real" },
  { icon: Package, label: "Produtos Ilimitados" },
];

// Fallback enquanto o preço real (PlanConfig) não chega da API.
const DEFAULT_MONTHLY_PRICE = 39.9;

export default function UpgradeModal({ isOpen, onClose, feature, description }: UpgradeModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState(DEFAULT_MONTHLY_PRICE);

  // ✅ Preço vem do PlanConfig (mesma fonte que o checkout do Asaas cobra).
  // Antes estava fixo "R$ 39,90" no texto do botão — se o admin mudasse o
  // preço, o modal anunciava um valor e a cobrança vinha outro.
  useEffect(() => {
    if (!isOpen) return;
    plansApi.list()
      .then((plans) => {
        const pro = Array.isArray(plans) ? plans.find((p: any) => p.plan_type === "pro") : null;
        const price = pro?.monthly_price;
        if (price != null) {
          const parsed = typeof price === "number" ? price : parseFloat(price);
          if (!Number.isNaN(parsed)) setMonthlyPrice(parsed);
        }
      })
      .catch(() => { /* mantém o fallback */ });
  }, [isOpen]);

  const priceLabel = monthlyPrice.toFixed(2).replace(".", ",");

  const handleSubscribe = async () => {
    setProcessing(true);
    try {
      const result = await paymentsApi.createCheckout("monthly");

      if (!result?.checkout_url) {
        throw new Error("Não recebemos o link de pagamento.");
      }

      // Redireciona para o checkout hospedado do Asaas. Usamos
      // window.location (e não window.open) porque popup de pagamento
      // costuma ser bloqueado pelo navegador.
      window.location.href = result.checkout_url;
    } catch (error: any) {
      const msg: string = error?.message || "";

      // Caso a loja já seja PRO (o backend responde 400 nesse cenário)
      if (msg.toLowerCase().includes("já possui")) {
        toast({
          title: "Você já é PRO 💜",
          description: "Sua assinatura já está ativa. Aproveite os recursos!",
        });
        onClose();
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={processing ? undefined : onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="w-full max-w-md rounded-2xl bg-card border border-brand/15 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="relative bg-gradient-to-br from-brand to-brand-hover px-6 py-8 text-center">
              <button
                onClick={onClose}
                disabled={processing}
                className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <h2 className="font-display text-xl font-bold text-white">
                {feature ? `${feature} é PRO` : "Recurso Exclusivo PRO"}
              </h2>
              <p className="mt-1 text-sm text-white/80">
                {description || "Desbloqueie velocidade e inteligência para seu negócio"}
              </p>
            </div>

            {/* Features */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs font-semibold text-brand-rose/60 uppercase tracking-wider">
                Tudo do PRO:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PRO_FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 border border-brand-peach/30"
                  >
                    <f.icon className="h-4 w-4 text-brand shrink-0" />
                    <span className="text-xs font-medium text-foreground">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6 space-y-3">
              <button
                onClick={handleSubscribe}
                disabled={processing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90 transition-opacity disabled:opacity-70"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Abrindo pagamento...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Assinar PRO — R$ {priceLabel}/mês
                  </>
                )}
              </button>

              {/* Sinal de confiança + opção anual */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-brand-rose/60">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Pagamento seguro via Asaas · Pix, cartão ou boleto</span>
              </div>

              <button
                onClick={() => { onClose(); navigate("/plans"); }}
                disabled={processing}
                className="w-full text-center text-xs font-medium text-brand hover:underline disabled:opacity-50"
              >
                Ver plano anual (economize)
              </button>

              <button
                onClick={onClose}
                disabled={processing}
                className="w-full text-center text-xs text-brand-rose/60 hover:text-foreground transition-colors disabled:opacity-50"
              >
                Continuar no plano gratuito
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}