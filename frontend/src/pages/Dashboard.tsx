// pages/Dashboard.tsx
//
// Duas abas:
//   • Relatórios — fluxo de caixa, vendas e saídas de produto (padrão)
//   • Meu MEI    — controle do teto anual e relatório para o contador
//
// Filtro de período (dia / mês / ano) recarrega todos os blocos de uma vez:
// os dados vêm de UMA chamada só (/api/reports/), porque no celular cada
// requisição extra é espera que a consultora sente.
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Wallet, Crown, Loader2, AlertTriangle, ArrowLeft,
  ArrowDownRight, ArrowUpRight, Trophy, Package, BarChart3, Receipt,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { api } from "../services/api";
import { useFeatureGates } from "../hooks/useFeatureGates";
import MeicashFlow from "../components/MeicashFlow";
import PeriodoSelect from "../components/PeriodoSelect";
import type { PeriodoRelatorio, IntervaloDatas } from "../lib/api";
import { btn } from "../lib/ui";
import { queryPeriodo } from "../lib/api";

type Aba = "relatorios" | "mei";

// Linhas mostradas antes de expandir.
const LINHAS_VISIVEIS = 5;

const dinheiro = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (d: string) => {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}`;
};

interface Resumo { entradas: number; saidas: number; lucro: number; custo_vendido: number }
interface LinhaFluxo {
  id: number; data: string; tipo: string; natureza: "entrada" | "saida";
  produto: string; quantidade: number; valor: number; descricao: string;
}
interface PontoEvolucao { rotulo: string; entradas: number; saidas: number; saldo: number }
interface TopProduto { produto: string; quantidade: number; receita: number }
interface LinhaSaida {
  id: number; data: string; produto: string; tipo: string;
  valor_unitario: number; quantidade: number; total: number; descricao: string;
}
interface Acabando { id: number | string; produto: string; estoque: number; minimo: number }

interface Relatorio {
  rotulo: string;
  resumo: Resumo;
  fluxo: LinhaFluxo[];
  evolucao: PontoEvolucao[];
  top_produtos: TopProduto[];
  saidas: LinhaSaida[];
  acabando: Acabando[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLocked, loading: gatesLoading } = useFeatureGates();
  const bloqueado = !gatesLoading && isLocked("dashboard_charts");

  const [aba, setAba] = useState<Aba>("relatorios");
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("30d");
  const [datas, setDatas] = useState<IntervaloDatas | undefined>();
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Quais tabelas estão expandidas. Colapsadas por padrão para a tela não
  // virar uma rolagem sem fim no celular.
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const alternar = (k: string) =>
    setExpandido((e) => ({ ...e, [k]: !e[k] }));

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get(`/reports/?${queryPeriodo(periodo, datas)}`)
      .then(({ data }) => setDados(data))
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, [periodo, datas]);

  useEffect(() => {
    if (gatesLoading || bloqueado) return;
    carregar();
  }, [gatesLoading, bloqueado, carregar]);

  if (gatesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (bloqueado) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <Crown className="h-7 w-7 text-brand" />
        </div>
        <h1 className="font-display text-lg font-bold text-foreground">
          Relatórios são um recurso PRO
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe seu caixa, o que mais vende e para onde vão seus produtos.
        </p>
        <button
          onClick={() => navigate("/plans")}
          className={`mt-6 ${btn.primarioBloco}`}
        >
          Ver planos
        </button>
      </div>
    );
  }

  return (
    // Sempre claro: os valores em destaque (Entrou / Saiu / Lucro) perdem
    // legibilidade em vinho sobre fundo escuro, e a paleta não tem verde
    // para abrir contraste. Ver .tema-claro no index.css.
    <div className="tema-claro min-h-screen">
      {/* Header com volta para a home */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate("/")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Voltar para o início"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-base font-bold text-foreground">
            Relatórios
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {/* Abas */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {([
          ["relatorios", "Relatórios", BarChart3],
          ["mei", "Meu MEI", Receipt],
        ] as [Aba, string, any][]).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
              aba === k ? "bg-brand text-white" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {aba === "mei" ? (
        <MeicashFlow />
      ) : (
        <>
          {/* Filtro de período */}
          <div className="flex items-center justify-end">
            <PeriodoSelect
              valor={periodo}
              datas={datas}
              onChange={(p, d) => { setPeriodo(p); setDatas(d); }}
            />
          </div>

          {carregando ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : !dados ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Não foi possível carregar os relatórios.
              <button onClick={carregar} className="ml-2 font-medium text-brand hover:underline">
                Tentar de novo
              </button>
            </div>
          ) : (
            <>
              {/* 1. Cards: entrou, saiu, lucro */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <CardValor
                  icone={TrendingUp} cor="entrada"
                  titulo="Entrou" valor={dados.resumo.entradas} sub="vendas no período"
                />
                <CardValor
                  icone={TrendingDown} cor="saida"
                  titulo="Saiu" valor={dados.resumo.saidas} sub="compras de estoque"
                />
                <CardValor
                  icone={Wallet} cor="resultado"
                  titulo="Lucro" valor={dados.resumo.lucro} sub="vendas menos o custo"
                />
              </div>

              {/* 2. Gráfico de evolução */}
              {dados.evolucao.length > 0 && (
                <Bloco titulo="Evolução do caixa">
                  <ResponsiveContainer width="100%" height={230}>
                    <ComposedChart data={dados.evolucao}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip
                        formatter={(v: number, n: string) => [dinheiro(v), n]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {/* Cores da paleta da marca. Entrada usa o vinho cheio e
                          saída a versão rosa, bem mais clara: como não há
                          verde no sistema, a distinção entre as barras vem do
                          contraste de luminosidade, não do matiz. */}
                      <Bar dataKey="entradas" name="Entrou" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="saidas" name="Saiu" fill="var(--color-brand-rose)" radius={[4, 4, 0, 0]} />
                      <Line
                        type="monotone" dataKey="saldo" name="Saldo"
                        stroke="hsl(var(--brand))" strokeWidth={2} dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Bloco>
              )}

              {/* 3. Tabela de fluxo de caixa */}
              <Bloco titulo="Fluxo de caixa"
                     ocultos={Math.max(0, dados.fluxo.length - LINHAS_VISIVEIS)}
                     expandido={!!expandido.fluxo}
                     onAlternar={() => alternar("fluxo")} vazio={dados.fluxo.length === 0}
                     msgVazio="Nenhuma movimentação de dinheiro no período.">
                <Tabela cabecalho={["Data", "Movimento", "Produto", "Qtd", "Valor"]}>
                  {(expandido.fluxo ? dados.fluxo : dados.fluxo.slice(0, LINHAS_VISIVEIS)).map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2.5 text-muted-foreground">{dataBR(l.data)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            l.natureza === "entrada" ? "text-success" : "text-destructive"
                          }`}
                        >
                          {l.natureza === "entrada" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {l.tipo}
                        </span>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-foreground">{l.produto}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{l.quantidade}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-semibold ${
                          l.natureza === "entrada" ? "text-success" : "text-destructive"
                        }`}
                      >
                        {l.natureza === "entrada" ? "+" : "−"} {dinheiro(l.valor)}
                      </td>
                    </tr>
                  ))}
                </Tabela>
              </Bloco>

              {/* 4. Top 10 mais vendidos */}
              <Bloco titulo="10 mais vendidos"
                     ocultos={Math.max(0, dados.top_produtos.length - LINHAS_VISIVEIS)}
                     expandido={!!expandido.top}
                     onAlternar={() => alternar("top")} vazio={dados.top_produtos.length === 0}
                     msgVazio="Nenhuma venda registrada no período.">
                <ul>
                  {(expandido.top ? dados.top_produtos : dados.top_produtos.slice(0, LINHAS_VISIVEIS)).map((p, i) => (
                    <li
                      key={p.produto}
                      className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-0"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          i === 0 ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i === 0 ? <Trophy className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.produto}</span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-foreground">
                          {p.quantidade} un
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {dinheiro(p.receita)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloco>

              {/* 5. Saídas de produto (com a descrição) */}
              <Bloco
                titulo="Saídas de produto"
                subtitulo="Inclui vendas, presentes, brindes e uso próprio"
                vazio={dados.saidas.length === 0}
                msgVazio="Nenhuma saída registrada no período."
                ocultos={Math.max(0, dados.saidas.length - LINHAS_VISIVEIS)}
                expandido={!!expandido.saidas}
                onAlternar={() => alternar("saidas")}
              >
                <Tabela cabecalho={["Data", "Produto", "Tipo", "Valor", "Qtd", "Total", "Descrição"]}>
                  {(expandido.saidas ? dados.saidas : dados.saidas.slice(0, LINHAS_VISIVEIS)).map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{dataBR(s.data)}</td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-foreground">{s.produto}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            s.tipo === "Venda"
                              ? "bg-success/10 text-success"
                              : s.tipo === "Perda"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.tipo}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">
                        {dinheiro(s.valor_unitario)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{s.quantidade}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-foreground">
                        {dinheiro(s.total)}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground" title={s.descricao}>
                        {s.descricao || "—"}
                      </td>
                    </tr>
                  ))}
                </Tabela>
              </Bloco>

              {/* 6. Produtos acabando */}
              {dados.acabando.length > 0 && (
                <Bloco titulo="Produtos acabando"
                     ocultos={Math.max(0, dados.acabando.length - LINHAS_VISIVEIS)}
                     expandido={!!expandido.acabando}
                     onAlternar={() => alternar("acabando")}>
                  <ul>
                    {(expandido.acabando ? dados.acabando : dados.acabando.slice(0, LINHAS_VISIVEIS)).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 first:border-0"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${
                              a.estoque === 0 ? "text-destructive" : "text-amber-600"
                            }`}
                          />
                          <span className="truncate text-sm text-foreground">{a.produto}</span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            a.estoque === 0 ? "text-destructive" : "text-amber-600"
                          }`}
                        >
                          {a.estoque === 0 ? "acabou" : `restam ${a.estoque}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloco>
              )}
            </>
          )}
        </>
      )}
      </div>
    </div>
  );
}

/* ── Componentes auxiliares ── */

function CardValor({
  icone: Icone, cor, titulo, valor, sub,
}: { icone: any; cor: "entrada" | "saida" | "resultado"; titulo: string; valor: number; sub: string }) {
  // Sem verde na paleta, a distinção entre os três números não pode vir do
  // matiz — os cards ficariam todos no mesmo tom de vinho. A hierarquia usa
  // CONTRASTE e peso:
  //   entrada   → vinho da marca
  //   saída     → vermelho (convenção universal para dinheiro que sai)
  //   resultado → quase preto: é o número que mais importa, então é o de
  //               maior contraste da tela, com fundo levemente destacado
  const estilos = {
    entrada:   { borda: "border-brand/20 bg-brand/5",              texto: "text-brand" },
    saida:     { borda: "border-destructive/20 bg-destructive/5",  texto: "text-destructive" },
    resultado: { borda: "border-brand/30 bg-brand/10",             texto: "text-foreground" },
  }[cor];
  return (
    <div className={`rounded-xl border p-4 ${estilos.borda}`}>
      <div className="flex items-center gap-2">
        <Icone className={`h-4 w-4 shrink-0 ${estilos.texto}`} />
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${valor < 0 ? "text-destructive" : estilos.texto}`}>
        {dinheiro(valor)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Bloco({
  titulo, subtitulo, children, vazio, msgVazio, ocultos = 0, expandido, onAlternar,
}: {
  titulo: string; subtitulo?: string; children: React.ReactNode;
  vazio?: boolean; msgVazio?: string;
  /** Quantas linhas estão escondidas (0 = nada a expandir). */
  ocultos?: number;
  expandido?: boolean;
  onAlternar?: () => void;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-display text-base font-bold text-foreground">{titulo}</h2>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {vazio ? (
          <div className="px-4 py-8 text-center">
            <Package className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{msgVazio}</p>
          </div>
        ) : (
          <>
            {children}
            {/* Só aparece quando há linhas escondidas ou a lista está aberta.
                Manter as tabelas curtas evita rolagem infinita no celular. */}
            {(ocultos > 0 || expandido) && onAlternar && (
              <button
                onClick={onAlternar}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-brand transition-colors hover:bg-brand/5"
                aria-expanded={!!expandido}
              >
                {expandido ? (
                  <>
                    Ver menos <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Ver mais {ocultos} {ocultos === 1 ? "linha" : "linhas"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Tabela({ cabecalho, children }: { cabecalho: string[]; children: React.ReactNode }) {
  return (
    // Rola na horizontal no celular em vez de cortar colunas.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            {cabecalho.map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2.5 font-medium ${
                  i >= 3 && i < cabecalho.length - 1 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}