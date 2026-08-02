// src/components/ConsentManager.tsx
import { useState } from "react";
import { Button } from "./ui/button";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useConsent, type Purpose, ESSENTIAL_PURPOSES, OPTIONAL_PURPOSES } from "@/hooks/useConsent";

interface ConsentManagerProps {
  onComplete?: (purposes: Purpose[]) => Promise<boolean>;
  loading?: boolean;
}

// Labels centralizados — o texto de cada finalidade continua aqui,
// detalhado, pra atender à exigência da LGPD (art. 9º) de informar
// claramente cada finalidade. O que mudou é a interação: em vez de a
// pessoa marcar uma por uma, é tudo mostrado como informação e há um
// único botão de aceite.
const LABELS: Record<Purpose, { title: string; desc: string }> = {
  essential: {
    title: "Funcionamento básico do sistema",
    desc: "Cookies e dados necessários para o sistema operar.",
  },
  authentication: {
    title: "Autenticação e segurança",
    desc: "Manter sua sessão segura e proteger sua conta.",
  },
  service_delivery: {
    title: "Entrega do serviço",
    desc: "Processar seus dados de estoque, vendas e operação.",
  },
  analytics: {
    title: "Análise de uso e melhorias",
    desc: "Métricas anônimas para evoluirmos o produto.",
  },
  marketing: {
    title: "Comunicações e ofertas",
    desc: "Receber novidades, dicas e promoções por email.",
  },
  behavior_tracking: {
    title: "Rastreamento de comportamento",
    desc: "Entender como você usa o sistema para personalizar.",
  },
  ai_features: {
    title: "Recursos de inteligência artificial",
    desc: "Análises e sugestões geradas por IA sobre seu estoque.",
  },
  ai_training: {
    title: "Treinamento de modelos de IA",
    desc: "Usar dados de entrada e saída de estoque (produto, quantidade, preço, data) para treinar e melhorar os modelos de IA da plataforma. Não inclui nome de cliente, CPF, RG, endereço ou qualquer outro dado pessoal — só padrões de estoque e vendas.",
  },
};

const ALL_PURPOSES: Purpose[] = [...ESSENTIAL_PURPOSES, ...OPTIONAL_PURPOSES];

export function ConsentManager({ onComplete, loading }: ConsentManagerProps) {
  const { recordConsent } = useConsent();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleAcceptAll = async () => {
    setSubmitting(true);
    try {
      if (onComplete) {
        await onComplete(ALL_PURPOSES);
      } else {
        await recordConsent(ALL_PURPOSES);
      }
      toast.toast({
        title: "✅ Consentimento registrado",
        description: "Suas preferências de privacidade foram salvas.",
      });
    } catch (error) {
      console.error("❌ Consent error:", error);
      toast.toast({
        title: "❌ Erro ao registrar consentimento",
        description: "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (onComplete) onComplete([]);
  };

  return (
    <div className="space-y-5 py-4">
      {/* Finalidades essenciais */}
      <section>
        <h4 className="mb-2 text-sm font-semibold text-foreground">
          Finalidades essenciais
        </h4>
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          {ESSENTIAL_PURPOSES.map((key) => (
            <div key={key} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="text-sm">
                <div className="font-medium text-foreground">{LABELS[key].title}</div>
                <div className="text-muted-foreground">{LABELS[key].desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Finalidades opcionais — informativo, sem toggle individual */}
      <section>
        <h4 className="mb-2 text-sm font-semibold text-foreground">
          Também usamos seus dados para
        </h4>
        <div className="space-y-3 rounded-lg border border-border p-3">
          {OPTIONAL_PURPOSES.map((key) => (
            <div key={key} className="text-sm">
              <div className="font-medium text-foreground">{LABELS[key].title}</div>
              <div className="text-muted-foreground">{LABELS[key].desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Botões */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={submitting || loading}
        >
          Agora não
        </Button>
        <Button onClick={handleAcceptAll} disabled={submitting || loading}>
          {submitting || loading ? "Salvando..." : "Aceitar tudo"}
        </Button>
      </div>
    </div>
  );
}