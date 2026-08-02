// components/PromotionBanner.tsx
//
// Sem isto, uma promoção criada e ativada no admin-panel nunca aparecia em
// lugar nenhum — o recurso não tinha nenhum efeito fora do próprio painel.
// Mostra a promoção mais relevante entre as ativas pra loja de quem está
// logado (o backend já filtra por segmento ou por consultora específica —
// aqui só exibe o que veio).
import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { api } from "../services/api";
import { promotionTrackingApi } from "../lib/api";

interface Promocao {
  id: string;
  title: string;
  message: string;
  discount_percent: number;
  discount_amount: number;
  background_color: string;
  text_color: string;
}

const DISPENSADAS_KEY = "promocoes_dispensadas";

export function PromotionBanner() {
  const [promocao, setPromocao] = useState<Promocao | null>(null);

  useEffect(() => {
    api
      .get("promotions/active/")
      .then((res) => {
        const lista: Promocao[] = res.data || [];
        const dispensadas: string[] = JSON.parse(localStorage.getItem(DISPENSADAS_KEY) || "[]");
        const proxima = lista.find((p) => !dispensadas.includes(p.id));
        if (proxima) {
          setPromocao(proxima);
          // 📊 É isto que faz "Visualizações" no admin-panel virar um
          // número real — antes não existia nenhum registro de quem viu.
          promotionTrackingApi.registerView(proxima.id).catch(() => { /* não é motivo pra esconder o banner */ });
        }
      })
      .catch(() => { /* sem promoção ativa ou erro de rede — não é motivo pra mostrar nada */ });
  }, []);

  if (!promocao) return null;

  const dispensar = () => {
    const dispensadas: string[] = JSON.parse(localStorage.getItem(DISPENSADAS_KEY) || "[]");
    // Guarda só as últimas 20 — não deixa esse localStorage crescer pra sempre.
    localStorage.setItem(DISPENSADAS_KEY, JSON.stringify([...dispensadas, promocao.id].slice(-20)));
    setPromocao(null);
  };

  const desconto =
    promocao.discount_percent > 0
      ? `${promocao.discount_percent}% OFF`
      : promocao.discount_amount > 0
      ? `R$ ${Number(promocao.discount_amount).toFixed(2)} OFF`
      : null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{ backgroundColor: promocao.background_color, color: promocao.text_color }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        <p className="truncate">
          <strong>{promocao.title}</strong>
          {desconto && <span className="ml-1.5 font-bold">{desconto}</span>}
          <span className="ml-1.5 opacity-90">— {promocao.message}</span>
        </p>
      </div>
      <button onClick={dispensar} className="shrink-0 rounded-full p-1 hover:bg-black/10" title="Dispensar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}