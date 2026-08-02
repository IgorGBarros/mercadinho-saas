// components/admin/ConsultantsHealthTab.tsx
// Os indicadores de gestão que saíram do Dashboard da consultora moram aqui.
//
// Motivo da mudança: para ela, "Giro de Estoque 0,42" e "ROI 66%" não geram
// ação nenhuma — ela quer saber o que repor e o que está vencendo. Para quem
// administra a plataforma, esses mesmos números mostram quais consultoras
// estão vendendo, quais estão paradas e quais precisam de ajuda.
import { useState, useEffect } from "react";
import {
  Loader2, TrendingUp, Users, AlertTriangle, Wallet, ArrowUpDown,
} from "lucide-react";
import { adminHealthApi, type ConsultantHealth } from "../../lib/api";

const dinheiro = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Ordem = "receita_30d" | "saude" | "capital_investido" | "giro_estoque";

export default function ConsultantsHealthTab() {
  const [dados, setDados] = useState<{
    totais: any;
    consultoras: ConsultantHealth[];
  } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("receita_30d");

  useEffect(() => {
    adminHealthApi
      .getConsultants()
      .then(setDados)
      .catch((e: any) => setErro(e?.message || "Não foi possível carregar."))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {erro || "Sem dados."}
      </div>
    );
  }

  const { totais } = dados;
  const lista = [...dados.consultoras].sort(
    (a, b) => (b[ordem] as number) - (a[ordem] as number)
  );

  const corSaude = (s: number) =>
    s >= 80 ? "text-success" : s >= 60 ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-5">
      {/* Totais da plataforma */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={Users} label="Consultoras" valor={String(totais.consultoras)}
              detalhe={`${totais.ativas_30d} ativas em 30 dias`} />
        <Card icon={TrendingUp} label="Receita (30d)" valor={dinheiro(totais.receita_total_30d)}
              detalhe={`média ${dinheiro(totais.receita_media_por_consultora)}`} />
        <Card icon={Wallet} label="Capital em estoque" valor={dinheiro(totais.capital_investido_total)}
              detalhe="somado de todas" />
        <Card icon={AlertTriangle} label="Em risco" valor={String(totais.em_risco)}
              detalhe="saúde abaixo de 60" alerta={totais.em_risco > 0} />
      </div>

      {/* Ordenação */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUpDown className="h-3 w-3" /> Ordenar por:
        </span>
        {([
          ["receita_30d", "Receita"],
          ["saude", "Saúde"],
          ["capital_investido", "Capital"],
          ["giro_estoque", "Giro"],
        ] as [Ordem, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setOrdem(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              ordem === k
                ? "bg-brand text-white"
                : "border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabela — rola na horizontal no celular */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Consultora</th>
              <th className="px-3 py-3 text-right font-medium">Receita 30d</th>
              <th className="px-3 py-3 text-right font-medium">Lucro</th>
              <th className="px-3 py-3 text-right font-medium" title="Lucro sobre o custo do que foi vendido">ROI</th>
              <th className="px-3 py-3 text-right font-medium" title="Quanto do estoque parado virou venda">Giro</th>
              <th className="px-3 py-3 text-right font-medium">Capital</th>
              <th className="px-3 py-3 text-right font-medium">Ticket</th>
              <th className="px-3 py-3 text-center font-medium">Alertas</th>
              <th className="px-3 py-3 text-center font-medium">Saúde</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.store_id} className="border-t border-border hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.email}</p>
                </td>
                <td className="px-3 py-3 text-right font-semibold text-foreground">
                  {dinheiro(c.receita_30d)}
                </td>
                <td className={`px-3 py-3 text-right ${c.lucro_30d >= 0 ? "text-success" : "text-destructive"}`}>
                  {dinheiro(c.lucro_30d)}
                </td>
                <td className="px-3 py-3 text-right text-muted-foreground">{c.roi_percent}%</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{c.giro_estoque}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{dinheiro(c.capital_investido)}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{dinheiro(c.ticket_medio)}</td>
                <td className="px-3 py-3 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {c.estoque_baixo > 0 && (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-600">
                        {c.estoque_baixo} acabando
                      </span>
                    )}
                    {c.lotes_vencidos > 0 && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                        {c.lotes_vencidos} vencidos
                      </span>
                    )}
                    {c.lotes_vencendo > 0 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                        {c.lotes_vencendo} vencendo
                      </span>
                    )}
                    {c.estoque_baixo === 0 && c.lotes_vencidos === 0 && c.lotes_vencendo === 0 && (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-3 text-center font-bold ${corSaude(c.saude)}`}>
                  {c.saude}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <strong>Saúde</strong> combina atividade de vendas, giro de estoque e risco de
        perda por validade. Serve para priorizar quem precisa de ajuda — não é
        uma nota contábil. <strong>Giro</strong> é quanto do capital parado virou
        venda nos últimos 30 dias.
      </p>
    </div>
  );
}

function Card({
  icon: Icon, label, valor, detalhe, alerta,
}: {
  icon: any; label: string; valor: string; detalhe: string; alerta?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-destructive/25 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${alerta ? "text-destructive" : "text-brand"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-bold text-foreground">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{detalhe}</p>
    </div>
  );
}