// components/MeiCashFlow.tsx
// Fluxo de caixa simplificado para consultoras MEI.
//
// Princípio: a consultora NUNCA lança despesa manualmente. Entradas e saídas
// são um subproduto automático do estoque — venda gera entrada, compra de
// estoque gera saída. Isso elimina o erro de "esqueci de lançar" e mantém a
// tela compreensível para quem não é da área contábil.
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, Download, AlertTriangle, Loader2 } from "lucide-react";
import { meiApi, type MeiSummary, type PeriodoRelatorio, type IntervaloDatas } from "../lib/api";
import { btn } from "../lib/ui";
import PeriodoSelect from "./PeriodoSelect";
import { useToast } from "./ui/use-toast";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MeiCashFlow() {
  const { toast } = useToast();
  const [dados, setDados] = useState<MeiSummary | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState(false);
  // ⚠️ TODOS os hooks ficam aqui em cima, antes de qualquer `return`.
  // O React exige o mesmo número de hooks em toda renderização; um useState
  // depois de um `return` condicional derruba a tela com o erro #310.
  //
  // O filtro afeta só os cards de caixa. O teto do MEI é anual por definição
  // legal e não muda com o período escolhido.
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("30d");
  const [datas, setDatas] = useState<IntervaloDatas | undefined>();

  useEffect(() => {
    meiApi.getSummary(periodo, datas)
      .then(setDados)
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, [periodo, datas]);

  const baixarRelatorio = async () => {
    setBaixando(true);
    try {
      await meiApi.downloadReport(dados?.ano);
      toast({
        title: "Relatório baixado",
        description: "O arquivo abre no Excel ou no Google Sheets.",
      });
    } catch {
      toast({
        title: "Não foi possível gerar o relatório",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setBaixando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-10">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  if (!dados) return null;

  const { mes_atual, mei, ano } = dados;
  const excedeu = mei.situacao === "excedido" || mei.situacao === "excedido_grave";
  const atencao = mei.situacao === "atencao";

  // Barra fica entre 0 e 100%. O Math.max protege contra valor negativo:
  // largura negativa é CSS inválido e o navegador renderizava a barra CHEIA,
  // dando a impressão de teto estourado quando o número era o oposto disso.
  const larguraBarra = Math.max(0, Math.min(mei.percentual_usado, 100));
  const corBarra = excedeu ? "bg-destructive" : atencao ? "bg-amber-500" : "bg-success";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-foreground">
          Meu caixa
        </h2>
        <PeriodoSelect
          valor={periodo}
          datas={datas}
          onChange={(p, d) => { setPeriodo(p); setDatas(d); }}
          compacto
        />
      </div>

      {/* Os três números que importam */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-success/20 bg-success/5 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Entrou (vendas)</span>
          </div>
          <p className="mt-2 text-xl font-bold text-success">
            {dinheiro(mes_atual.entradas)}
          </p>
        </div>

        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Saiu (compras)</span>
          </div>
          <p className="mt-2 text-xl font-bold text-destructive">
            {dinheiro(mes_atual.saidas)}
          </p>
        </div>

        <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-brand shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Sobrou</span>
          </div>
          <p className={`mt-2 text-xl font-bold ${mes_atual.sobra < 0 ? "text-destructive" : "text-foreground"}`}>
            {dinheiro(mes_atual.sobra)}
          </p>
        </div>
      </div>

      {/* Controle do teto MEI */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">
            Faturamento MEI {ano}
          </span>
          <span className="text-xs text-muted-foreground">
            {dinheiro(dados.ano_atual.receita_bruta)} de {dinheiro(mei.limite)}
          </span>
        </div>

        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(mei.percentual_usado)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Faturamento usado: ${mei.percentual_usado}% do limite do MEI`}
        >
          <div
            className={`h-full rounded-full transition-all ${corBarra}`}
            style={{ width: `${larguraBarra}%` }}
          />
        </div>

        {excedeu ? (
          <div className="flex gap-2 rounded-lg bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-foreground">
              Você passou do limite do MEI ({mei.percentual_usado}%).
              {mei.situacao === "excedido_grave"
                ? " O excesso passou de 20%, o que costuma exigir migração para Microempresa."
                : " Normalmente é preciso recolher um DAS complementar sobre o excedente."}{" "}
              <strong>Procure seu contador para confirmar o que fazer.</strong>
            </p>
          </div>
        ) : atencao ? (
          <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-foreground">
              Você já usou {mei.percentual_usado}% do limite anual.
              Faltam {dinheiro(mei.restante)} para o teto.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Faltam {dinheiro(mei.restante)} para o limite anual.
          </p>
        )}
      </div>

      {/* Relatório para o contador */}
      <button
        onClick={baixarRelatorio}
        disabled={baixando}
        className={`w-full ${btn.base} ${btn.lg} ${btn.suave}`}
      >
        {baixando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Baixar relatório para o contador
          </>
        )}
      </button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {dados.aviso}
      </p>
    </section>
  );
}